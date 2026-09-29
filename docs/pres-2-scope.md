# PRES-2 scope + architecture: the 13-stage lecture-deck production method as a resumable pipeline

- Item: PRES-2, area `presentations-authoring`, kind feature. Row filed at
  `docs/backlog.yml:1088-1099` (commit `56be148b`).
- Seat: `loop-architect` (Opus). A fresh `loop-checker` gates this document
  before any implementer builds from it. This seat does not check its own
  artifact.
- Consumes: the PRES-2 row (`docs/backlog.yml:1088-1099`, the owner's pasted
  13-stage method and the leverage note); `docs/pres-1-architecture.md` (the
  shipped presentations surface and its seams); `docs/a43-c-scope.md` (the
  conversational content-ops layer, C1+C3 shipped, C2 the successor); the
  shipped PRES-1 tree (`src/lib/presentations/*`,
  `src/app/components/presentations/*`); the shipped deck contract and its
  data-layer enforcers (`src/lib/slide-prompt.ts`, `src/lib/slide-graphics.ts`,
  `src/lib/pptx.ts`); and the A43 template path (`src/lib/decks/*`).
- Produces: (1) a stage-by-stage SHIPPED/PARTIAL/NEW map grounded in the tree
  with the file that proves each; (2) the SHAPE of the five genuinely-new pieces
  (mechanism, where the guarantee lives, the seam); (3) the recommended build
  sequence accounting for A43-C in flight; (4) the leverage argument; (5) the
  forks this seat cannot decide, phrased to terminate.
- This document decides SHAPE only. No production code. Oracle construction,
  fixtures, removal tests and sabotage are the test seat's
  (`docs/loop/seats.md:59,416-431`); wave-ordering detail and global-invariant
  accounting beyond the cut below are the plan's; the acceptance criteria for
  each wave are `loop-ac`'s.

All quantities name the command that produced them. Line counts use
`@(Get-Content <file>).Count` (PowerShell), the mandated instrument
(`docs/loop/this-repo.md` section 3); `Measure-Object -Line` is never used.
Absence claims run WITHOUT a pipe (so `$?` is grep's), each with a canary.
Measured at HEAD `56be148b`, 2026-09-29.

---

## 0. The headline finding, before the stage map: there are TWO deck surfaces, not one, and the method spans both

This is the one shape decision every later PRES-2 wave is built against, so it
is stated first and it is grounded, not asserted. The owner's row calls the
target "the Slide Deck Creation surface" and says PRES-2 "EXTENDS PRES-1 ...
A43 ... and A43-C" (`docs/backlog.yml:1092,1098`). Measured, those are **two
distinct tabs on two distinct code paths**, and the 13-stage method draws
capabilities from both:

1. **PRES-1 / "Slide Deck Creation"** lives under
   `src/app/components/presentations/*` and `src/lib/presentations/*`. It
   generates a deck from free pasted/uploaded context with ONE `callLlm` per
   artifact through a THIN prompt (`buildDeckPrompt`,
   `src/lib/presentations/prompts.ts:45-54`, 92 lines total) and serializes it
   with `buildSlidesPptx` from scratch (`src/lib/presentations/deck-file.ts`, 28
   lines). It has NO template conformance and does NOT compose the rich
   pedagogical contract below.
2. **A43 / A43-C / ppt-design** lives under `src/app/components/ppt-design/*` and
   `src/lib/decks/*`. It holds the uploaded-template structural guarantee (A43
   T1/T2, `src/lib/decks/office-template-fill.ts`, 200 lines; `fit-report.ts`,
   218) and the conversational per-slide content-ops (A43-C C1+C3,
   `src/lib/decks/deck-operations.ts`, 233; `src/app/api/decks/ask/route.ts`,
   155). It ALSO carries the rich deck contract
   (`src/lib/slide-prompt.ts`, 546 lines: `SLIDE_STRUCTURE_REQUIREMENTS`,
   `APPLIED_STRUCTURE_REQUIREMENTS`, `ASSERTION TITLES`, `SLIDE GRAPHICS`,
   `SECTION DIVIDERS`) and the data-layer enforcers
   (`enforceTitleLength`, `enforceCodingCycle`, `enforceNoCodeForApplied` in
   `slide-prompt.ts`; `enforceGraphicsForApplied` in `slide-graphics.ts:397`).

So the pedagogical richness the owner's stages 2/5/6/7/8 want ALREADY EXISTS -
but on the ppt-design path, not on the "Slide Deck Creation" surface the row
names. PRES-1's own deck prompt is thin and applies only `enforceTitleLength`
(`src/lib/presentations/parse.ts:5,109`). This split is the source of the
biggest fork (F1, section 8) and it shapes the whole build: **the five
genuinely-new pieces are designed as SURFACE-INDEPENDENT pure libraries**, so
they can be built and machine-verified before the surface fork is decided, and
consumed by whichever surface(s) the owner converges on.

`grep -rniE "deck-?standard|pinned-?frame|slide-?plan|polishDeck|checkDeckStandard" --include=*.ts src/`
-> exit 1 (canary: `grep -rc "presentations" docs/backlog.yml` -> non-zero):
every new name below is greenfield.

---

## 1. The 13-stage map, grounded (SHIPPED / PARTIAL / NEW)

Stage numbers are the OWNER'S 13, as pasted in the task and the row
(`docs/backlog.yml:1092,1097`). The row's own draft pipeline labels are
cross-checked and corrected here, not inherited. "SHIPPED" means a user reaches
it today; "PARTIAL" means the mechanism exists but not on the target surface, or
not enforced, or not as an editable pipeline stage; "NEW" means no code proves
it.

| # | Owner's stage | Status | The file that proves the status |
|---|---|---|---|
| 1 | Start from teaching materials, not a blank deck | **SHIPPED** | `src/app/components/presentations/SourcesEditor.tsx` + `panel-logic.ts:225-283` (drag-drop intake -> `PresentationSource`), extraction via `extractDeckSourceFileAction` (reused, `docs/pres-1-architecture.md:63`); context feeds every prompt by code at `src/lib/presentations/prompts.ts:16-22`. Drag-drop shipped at `f3b6fe6f`. |
| 2 | intuition -> analogy -> formal term -> mechanism -> real example -> application | **PARTIAL** (split) | The arc exists on the ppt-design path only: analogy/CONNECT-TO-THE-STUDENT (`slide-prompt.ts:77-78`), term+mechanism+example+application via the Example/Walkthrough/Practice/Answer cycle (`slide-prompt.ts:80-85`). PRES-1's `buildDeckPrompt` does NOT compose `slideStructureRequirements` - it is the thin prompt (`prompts.ts:45-54`). Not an explicit, editable outline intermediate. |
| 3 | ONE mental model reused (e.g. Find->Connect->Request->Build) | **NEW** | No frame/mental-model state anywhere. `grep -rniE "mentalModel\|pinned-?frame" --include=*.ts src/` -> exit 1 (canary `grep -rc "concept" src/lib/decks/generate.ts` -> non-zero). The `concept plan` in `decks/generate.ts:178,235` is breadth enumeration, a DIFFERENT thing (a subtopic list, not a reused mental model). |
| 4 | ONE running example threaded throughout | **NEW** | Same as stage 3: no running-example state; each slide's example is generated independently. |
| 5 | Design for 5-second comprehension (one dominant claim/slide) | **PARTIAL** | `ASSERTION TITLES` (`slide-prompt.ts:90,268`) asks the title to state one claim, and `enforceTitleLength` (`slide-prompt.ts:515`) caps it in code - but this is prompt+cap on the ppt-design path, NOT a per-slide "one dominant claim" object, and PRES-1's thin prompt omits `ASSERTION TITLES` entirely. |
| 6 | Visuals that EXPLAIN, not decorate | **PARTIAL** (model exists) | `SlideGraphic` = `matrix2x2 \| process \| table` (`src/lib/slide-graphics.ts:80`), `coerceSlideGraphic` (`:208`), the guaranteed Agenda graphic and `enforceGraphicsForApplied` follow-up fill (`slide-graphics.ts:397`). Deliberately NO chart kind and no arrow-direction/DNS-map/DOM-tree types (`slide-graphics.ts:16-40`). Correct-arrow-direction / "diagram implies something false" is a review concern, not a structural type. |
| 7 | Professional visual standards (title-slide-only-title, Title Case, consistent cards/typography/arrows/code, projection contrast, varied layouts) | **PARTIAL** (split) | Consistent typography/cards/contrast/layout are SHIPPED by construction: one writer, `buildSlidesPptx` (`src/lib/pptx.ts`, 680 lines), draws every deck. Title cap SHIPPED (`enforceTitleLength`, in PRES-1 too). **Title Case is NOT enforced on any generated-deck path.** `titleCase`-style helpers DO exist elsewhere - `src/lib/embedded/*` (offline scaffold, `embedded/deck.ts`, `embedded/course.ts`), `src/lib/embedded-grader/rubric.ts:95` (`titleCase`), and `src/lib/resource-links.ts:264` (`titleCaseToolKey`) - but NONE runs on any slide-deck generation (`callLlm`) path; they title-case grader criteria and tool keys, not generated slide titles. So the conclusion holds: no Title Case guard on any generated-deck path -> stage 7 NEW. Title-slide-only-title is not enforced. **Render into uploaded template (stage 7's structural half) is SHIPPED but only on ppt-design** (A43 `office-template-fill.ts`, byte-identity H1 at `docs/a43-scope.md:440,1157`). |
| 8 | Three activity candidates, pick one, weave throughout | **PARTIAL** | PRES-1 generates activity ideas (`buildActivitiesPrompt` asks for 3-5, `prompts.ts:34-43`) as a FLAT list with no pick-one/weave-throughout mechanism. The ppt-design contract weaves Practice/Your-Turn per concept (`slide-prompt.ts:80-85,256-262`) but does not offer three candidates to choose among. |
| 9 | Prediction-before-explanation; question and answer on SEPARATE slides | **NEW** (structural) | The coding Practice/Answer pair is on separate slides by prompt convention (`slide-prompt.ts:83-84`), but nothing makes a general prediction/answer pairing a STRUCTURAL invariant the app cannot violate. `grep -rniE "prediction" --include=*.ts src/lib` -> the sole hit is `src/lib/research/case-studies.ts:272` (an unrelated lesson string about evaluating model predictions). No prediction/answer-separation type. |
| 10 | Tie hands-on work back to theory | **PARTIAL** | Prompt-level only: Practice mirrors the concept (`slide-prompt.ts:83`), Recap closes the case-study loop (`slide-prompt.ts:99,280`). No explicit check that a hands-on slide references its concept. |
| 11 | Adversarial review of information flow | **PARTIAL** | PRES-1 has a per-artifact critique (`reviewArtifact`/`buildReviewPrompt`, `generate.ts:106-114`, `prompts.ts:56-71`) and a Regenerate-with-context button (`ArtifactCard.tsx:166-175`). It is a SINGLE undifferentiated critique blob, NOT the owner's named info-flow checklist (main point obvious, where-to-look-first, detail-too-early, diagram-implies-false, vocab-without-a-model, standalone-reconstructable) as itemized opt-in findings. |
| 12 | Adversarial review of visuals | **PARTIAL** | Same critique mechanism exists; the owner's named visual checklist (arrow direction, request/response as one message, HTML appearing to make requests, query-string vs fragment) as a named gate does not. |
| 13 | Production polish pass | **NEW** | No deterministic polish linter over the deck model. The closest precedents are the per-clause post-processors `enforceTitleLength`/`enforceCodingCycle` (`slide-prompt.ts:515,364`) and `enforceGraphicsForApplied` (`slide-graphics.ts:397`) - but none dedupes labels, normalizes spacing/badges, or checks phase/nav consistency across the whole deck. |
| - | The PIPELINE itself: resumable, editable intermediates, regenerate-at-stage-N with context | **PARTIAL -> NEW** | PRES-1 has a one-step version: per-artifact regenerate folding prior context+critique by code (`buildRegeneratePrompt`, `prompts.ts:76-92`, the LEV-1 enforcer). A43-C adds per-slide content-ops (`deck-operations.ts`). A multi-stage resumable pipeline where each stage emits an editable intermediate honored downstream (edit the Frame -> only affected slides regenerate) is NEW. |

**Correction to the row's draft map.** The row labels "lesson spec
(objectives/activities/terms/sequence)" as partial and "outline" as shipped
(`docs/backlog.yml:1098`). Measured: the OUTLINE is shipped but THIN (a single
Markdown blob, `OutlineContent { markdown }`, `types.ts:44-46`); the
"lesson spec" as a structured objectives/terms/sequence object does not exist on
the PRES-1 path (the structured concept-plan/sequencing lives only on ppt-design,
`decks/generate.ts:178,235`, `sequence.ts`). Both are more NEW than the row's
draft implies once the target surface is fixed.

---

## 2. The five genuinely-new pieces, designed at scope depth

All five are **pure or mocked-`callLlm` libraries, surface-independent**, so they
are machine-verifiable here (`docs/loop/this-repo.md` section 6: nothing renders
under vitest, the network is blocked). Each emits an EDITABLE intermediate. The
recommended home is a new leaf directory `src/lib/deck-standard/` (not
`src/lib/presentations/`, to keep the PRES-1 owns set and its 3 reader tests -
section 6 - out of every PRES-2 wave's write set, and to signal these are shared
by both surfaces). The type-only seam module is `src/lib/deck-standard/types.ts`.

### 2.1 THE DECK STANDARD (stages 5/7/9 standing rules as versioned, enforced config)

**Mechanism.** A frozen, versioned config object plus a pure checker that both
the generator and the review gate call.

```ts
// src/lib/deck-standard/types.ts (TYPE-ONLY, no runtime emit - the seams.md:163 exception)
export interface DeckStandard {
  version: string;                 // provenance stamp (e.g. "deck-standard-v1")
  titleMaxChars: number;           // reuses SLIDE_TITLE_MAX_CHARS = 60 (slide-prompt.ts:38)
  requireTitleCase: boolean;       // stage 7 - NEW check
  titleSlideOnlyTitle: boolean;    // stage 7 - slides[0].bullets must be empty
  maxBulletsPerSlide: number;      // stage 5 - the "one dominant claim" support cap (=4 today)
  requirePredictionAnswerSeparation: boolean; // stage 9 - held by S3's SlidePlan/validateSlidePlan (2.3), NOT a checkDeckStandard rule
}
export interface StandardViolation {
  slideIndex: number;              // -1 for deck-level
  rule: keyof DeckStandard;        // the exact clause violated
  detail: string;                  // human-readable, itemized
}
```

- **Where it is stored.** As a frozen code constant `DECK_STANDARD_V1` in
  `src/lib/deck-standard/standard.ts`, NOT a table: this checkout has no live
  database and RLS cannot be verified here (`docs/loop/this-repo.md` section 6).
  A per-instructor override is a `ta-` key (`ta-deck-standard-override`, matching
  the `ta-pres-*` family, `panel-logic.ts:163-165`), read defensively in
  try/catch like `readPersistedJSON` (`panel-logic.ts:180-188`). Per-course
  scoping needs a DB and is DEFERRED (fork F2, section 8).
- **Versioning / provenance.** The `standardVersion` is NOT a field on
  `GeneratedDeck`/`DeckContent`. That shared type (`{presentationTitle, slides}`,
  `src/lib/presentations/types.ts:53-54`, reused unchanged by
  `serializeDeckToPptx`/`parseDeckSlides`) stays untouched, because adding a field
  to it would pull those readers into S1's write set and break S1 disjointness.
  Instead the stamp is carried by a DECK-STANDARD-OWNED structure: the checker
  `checkDeckStandard(deck, standard)` returns `{ standardVersion, violations }`,
  so the rule-set that checked a deck travels with the check result, not on the
  deck model. S1's write set therefore stays `src/lib/deck-standard/*` only. This
  is the CORPUS half of the leverage (section 7): a chat cannot stamp or read back
  which rule-set it used.
- **Declaratively checkable (pure) vs needs an LLM judgment pass:**
  - PURE (this piece): `requireTitleCase` (string test), `titleSlideOnlyTitle`
    (`slides[0].bullets.length === 0`), `titleMaxChars` (already
    `enforceTitleLength`), `maxBulletsPerSlide` (`slide.bullets.length <= n`).
    These FOUR deck-decidable deterministic rules - and ONLY these four - become
    `checkDeckStandard(deck, standard): { standardVersion: string; violations: StandardViolation[] }`.
    `requirePredictionAnswerSeparation` is declared on the `DeckStandard` config
    but is NOT a `checkDeckStandard` rule: that invariant is held structurally by
    S3's `SlidePlan` type + `validateSlidePlan` (2.3), because it is decidable on
    the PLAN, not on the finished deck. The S1 implementer must not attempt
    prediction/answer separation inside `checkDeckStandard`.
  - LLM JUDGMENT (routed to the checklist gates, 2.4, NOT here): whether a title
    is genuinely ONE dominant claim (semantic), whether an analogy is apt,
    whether a visual explains rather than decorates. A style property of model
    prose has no instrument here (`docs/loop/seats.md:106-114`), so it must NOT
    be faked as a deterministic check.
- **The guarantee lives** in `checkDeckStandard` (pure), run BY THE GENERATOR
  after generation (beside `enforceTitleLength`) AND BY THE REVIEW GATE, both
  emitting the SAME `{ standardVersion, violations }` receipt - not a black-box "improved
  deck". The receipt is itemized and opt-in: the instructor sees each violation
  and chooses to fix it via an A43-C content-op (2.3/2.4), or accept it.
- **Editable intermediate:** the effective `DeckStandard` (constant merged with
  the `ta-` override) is itself the editable object; changing it re-runs
  `checkDeckStandard` with no model call.

### 2.2 THE PINNED FRAME (stages 3/4 as first-class, validated state)

**Mechanism.** A typed object set once, threaded into every slide prompt BY CODE,
with a pure consistency receipt.

```ts
export interface PinnedFrame {
  mentalModel: { name: string; steps: string[] };   // e.g. { name: "Web request", steps: ["Find","Connect","Request","Build"] }
  runningExample: { name: string; description: string };
}
```

- **Where it is set in the flow:** a Frame stage AFTER source intake (stage 1),
  BEFORE the outline (stage 2). It is an editable intermediate.
- **How it is threaded:** folded into every builder's prompt by code, exactly the
  way `buildRegeneratePrompt` folds `priorContext`/`priorCritique` as separate
  deletable lines (`src/lib/presentations/prompts.ts:76-92`). Presence in the
  prompt is guaranteed by construction; the two fold lines are the removal-test
  target.
- **Consistency validation (pure/mocked-testable):**
  `frameConsistencyReceipt(deck, frame): { slideIndex: number; mentions: number }[]`
  counts, per slide, how many of `mentalModel.steps` and `runningExample.name`
  appear (case-insensitive string containment). Drift = slides with zero
  mentions - an itemized, caught finding, NOT a hard failure (a title slide
  legitimately mentions neither). "Genuinely on-model" is semantic and stays an
  LLM checklist finding; the pure receipt only measures textual presence, which
  is honest about what it can prove.
- **The guarantee lives** in the code fold (present in every prompt) plus the
  receipt (drift is visible). Removal test: delete the frame-fold line ->
  the captured prompt no longer contains the mental-model step names.
- **Editable intermediate honored downstream:** the goal is that editing the
  Frame regenerates ONLY affected slides folding the new Frame - the granular
  "re-enter at stage 3" a chat lacks. This granular per-slide regeneration is
  genuinely NEW code, an S6 concern designed when S6 is cut (post-F1). It is NOT
  reuse of `regenerateArtifact` (`generate.ts:121`): that function regenerates a
  WHOLE artifact (one `callLlm`, rebuilding the entire deck via `parseDeckSlides`,
  `generate.ts:135`), and no per-slide regeneration exists in the tree today.

### 2.3 THE SLIDE-PLAN STAGE (dominant claim + prediction/answer as a STRUCTURAL invariant)

**Mechanism.** A per-slide plan whose type makes "question and answer on the same
slide" UNREPRESENTABLE - the A43-C move (make the bad state unconstructable,
`docs/a43-c-scope.md:129-137`), not a runtime check.

```ts
export type SlidePlanEntry =
  | { role: "content";    dominantClaim: string }
  | { role: "prediction"; dominantClaim: string; predictionId: string }
  | { role: "answer";     dominantClaim: string; predictionId: string };  // separate entry by construction
export interface SlidePlan { entries: SlidePlanEntry[] }  // 1 entry -> 1 slide
```

- **The invariant by construction:** a `prediction` and its `answer` are TWO
  entries, so they map to TWO slides - the app cannot emit them as one slide
  because the type has no "question+answer" variant. This is stage 9's "the app
  cannot spoil its own poll," held by the type, not by review.
- **Pure validator** `validateSlidePlan(plan): SlidePlanViolation[]`: every
  `prediction.predictionId` has exactly one matching `answer` and vice versa
  (no orphan prediction, no orphan answer); `dominantClaim` non-empty (stage 5).
  Direction of failure below (section 5).
- **Where the guarantee lives:** the discriminated type (construction) plus
  `validateSlidePlan` (belt). The dominant-claim string per entry is the stage-5
  "one dominant claim/slide" object the Deck Standard's 5-second rule binds to.
- **Editable intermediate:** the plan is edited before slides are generated;
  each entry drives one slide's prompt. Re-ordering or editing an entry should
  regenerate only that slide - which, like the Frame case (2.2), is genuinely NEW
  per-slide regeneration to be designed when S6 is cut (post-F1), NOT reuse of the
  whole-artifact `regenerateArtifact`.

### 2.4 ADVERSARIAL CHECKLISTS AS GATES (stages 11/12 as named, itemized, opt-in findings)

**Mechanism.** Two NAMED, versioned, closed checklists carrying the owner's exact
questions, run automatically, producing itemized findings the instructor opts
into - reusing PRES-1's critique call and A43-C's content-op to apply a fix.

```ts
export interface ChecklistQuestion { id: string; text: string; deterministic: boolean }
export const INFO_FLOW_CHECKLIST: ChecklistQuestion[] = [ /* main-point-obvious, where-to-look-first, detail-too-early, diagram-implies-false, vocab-without-a-model, standalone-reconstructable */ ];
export const VISUAL_CHECKLIST: ChecklistQuestion[] = [ /* arrow-direction, request/response-one-message, html-appears-to-request, query-string-vs-fragment */ ];
export interface ChecklistFinding { checklistId: string; questionId: string; slideIndex: number; finding: string; severity: "info" | "warn" }
```

- **Deterministic vs LLM, decided per question:**
  - DETERMINISTIC (pure, no model): "standalone-reconstructable" partial (a slide
    with a title and zero bullets fails); "vocabulary without a model" partial (a
    Terminology term with no definition row - checkable against the table
    graphic); the Deck-Standard-owned structural questions (title case, one
    claim) are already covered by 2.1 and are not re-run here.
  - LLM JUDGMENT (one `callLlm`, reusing `buildReviewPrompt`,
    `prompts.ts:56-71`): "is the main point obvious," "where does the eye land
    first," "does this diagram imply something false," "is the arrow direction
    right." These have no instrument here and MUST be a model pass, parsed into
    itemized `ChecklistFinding[]`.
- **Itemized and opt-in, NOT a black-box improved deck:** each finding is
  surfaced; the instructor applies the ones they want. Applying = an A43-C
  content-op (`applyDeckOperation`, `src/lib/decks/deck-operations.ts:168`, a
  `reword`/`condense`/`retitle` that CANNOT change slide count or reach the
  template) - so the fix flows through the shipped guarantee, never a free
  regeneration that could break template fit. **This makes A43-C's C2 surface a
  hard dependency for the APPLY step** (section 3); the FIND step (producing
  findings) does not need C2.
- **The guarantee lives** in the closed, versioned checklist (every question is
  read - a receipt lists which questions ran and which slides they touched, so no
  question is silently skipped) plus the pure finding-to-op mapping. This is the
  `class-trends-draft` shape of "the guard names the actual set, not a denylist"
  (`docs/loop/seats.md:115-123`): the checklist IS the set.

### 2.5 THE POLISH LINTER (stage 13 as a deterministic pass)

**Mechanism.** A pure pass over the deck model returning the polished deck plus a
change log, sitting beside the existing `enforce*` post-processors.

```ts
export function polishDeck(deck: DeckContent): { deck: DeckContent; changes: PolishChange[] }
export interface PolishChange { slideIndex: number; kind: "dedupe-label" | "normalize-spacing" | "normalize-badge" | "renumber-section"; detail: string }
```

- **Mechanically checkable (this piece):** dedupe identical section labels;
  normalize spacing (trim, collapse internal whitespace in titles/bullets);
  normalize activity badges (canonical `Practice:`/`Your Turn:` prefixes -
  matching the vocabulary `enforceCodingCycle` and the graphics guard already key
  on, `slide-prompt.ts:374,239`); renumber `Section <n>:` dividers contiguously.
  All are pure functions over `PptxSlide[]`.
- **Owner-verification only (NOT claimed as covered):** whether the RENDERED deck
  "looks polished," overlaps, or reads well from the back of the room - nothing
  renders under vitest (`docs/loop/this-repo.md` section 6). "Fix overlaps" is
  therefore scoped to what is representable in the model (a graphic + code on one
  slide, which `pptx.ts` already resolves by ignoring the graphic,
  `src/lib/pptx.ts:36-38`); true visual overlap is a render property and stays a
  residual (RES-PRES2-4, section 9).
- **The guarantee lives** in `polishDeck` (pure, idempotent: `polishDeck(polishDeck(d).deck).changes` is empty - a pinnable, sabotageable postcondition).

---

## 3. Reachability: the surface IS a layer, and A43-C's C2 is a dependency

Traced control -> code, because "a library and an endpoint with no surface
between them" has shipped here twice (`MEMORY.md`, verify-reachability;
`.claude/agents/loop-architect.md:37-39`). The five pieces above are pure
libraries; on their own they are INERT to the user. Each must land WITH the
seam that reaches it:

1. The FIND steps (Deck Standard check, Frame receipt, slide-plan validate,
   checklist findings, polish changes) each produce a typed receipt. The seam is
   a stage in the pipeline UI that renders the receipt as an itemized, opt-in
   list - this is the layer the user reaches, and it is designed on the
   presentations surface (F1 recommendation, section 8).
2. The APPLY step (turning a finding or violation into a fixed slide) routes
   through A43-C's `applyDeckOperation`. **A43-C's C2 (the in-app control,
   `docs/a43-c-scope.md:568-577`) is the surface that reaches the op layer today;
   it is IN FLIGHT and not yet landed.** PRES-2's apply-a-finding step therefore
   DEPENDS ON C2, and this document does not rebuild it. Until C2 lands, PRES-2's
   checklist/standard findings are surfaced and editable but their one-click
   "apply" is owed to C2.
3. Download/render is UNCHANGED and reuses the shipped serializer
   (`serializeDeckToPptx`, `deck-file.ts`) or, if the template-fill export is
   wired (F1), the shipped A43 fill path with its byte-identity guarantee.

No PRES-2 wave writes `office-template-fill.ts`, `deck-operations.ts`,
`fit-report.ts`, or `slide-prompt.ts` - all are reused unchanged. PRES-2 adds a
NEW `src/lib/deck-standard/*` and NEW pipeline surface files, and (per F1) may
compose the existing `slideStructureRequirements` into the presentations deck
prompt.

---

## 4. Recommended build sequence (by leverage-per-cost, A43-C landing first)

A43-C ships first and completely (C1+C3 shipped; C2 the successor,
`docs/a43-c-scope.md:522-524`), per its own ordering. PRES-2 then builds the pure
core, surface-independent, before touching the surface fork:

| Wave | Piece | Why here | Write set (disjoint) | Editable intermediate |
|---|---|---|---|---|
| **S1** | **DECK STANDARD** (2.1) | **START HERE.** Highest single advantage over a chat: the standing rules become versioned, enforced, stamped config instead of prose re-typed every session and drifted by slide 20. Pure, cheapest (reuses `enforceTitleLength`, `SLIDE_TITLE_MAX_CHARS`), and it FEEDS the review gate (S4). Its removal test is the leverage proof (section 7). | `src/lib/deck-standard/{types,standard}.ts` + tests | the effective `DeckStandard` |
| **S2** | **PINNED FRAME** (2.2) | Feeds every slide prompt; small typed object + pure receipt; unblocks stages 3/4 which nothing else covers. | `src/lib/deck-standard/frame.ts` + test | the `PinnedFrame` |
| **S3** | **SLIDE-PLAN** (2.3) | The stage-9 structural invariant; depends on nothing but the type; makes the poll un-spoilable by construction. | `src/lib/deck-standard/slide-plan.ts` + test | the `SlidePlan` |
| **S4** | **CHECKLIST GATES** (2.4) | Depends on S1 (standard) and reuses PRES-1 critique; its APPLY step depends on A43-C C2 (section 3), so FIND lands here and APPLY lands with/after C2. | `src/lib/deck-standard/checklists.ts` + test | `ChecklistFinding[]` |
| **S5** | **POLISH LINTER** (2.5) | Independent, deterministic, sits beside `enforce*`; can run any time after S1. | `src/lib/deck-standard/polish.ts` + test | polished deck + change log |
| **S6** | **PIPELINE + SURFACE** | Orchestrates S1-S5 as resumable editable stages on the chosen surface. **GATED on F1** (which surface) and on A43-C C2 (apply step). Cut into its own sub-waves once F1 is answered. | presentations surface files (F1) | every stage's intermediate |

**Argument for the Deck Standard first (for, and the honest against).** FOR: it
is the piece whose absence a chat feels most acutely (the owner's stage 5/7/9
rules are exactly what a chat forgets and cannot version), it is the cheapest to
build (a config object plus pure checks reusing shipped enforcers), it is
surface-independent so it de-risks F1, and it is the input the checklist gate
(S4) consumes - building S4 first would mean stubbing the standard. AGAINST,
considered: the Frame (S2) is arguably more novel (nothing covers stages 3/4 at
all, whereas stage 5/7 have partial prompt coverage). The tie-breaker is the
removal test: the Deck Standard has a clean, pure removal test (delete a rule
check -> its violations vanish, section 7); the Frame's advantage is textual
threading whose "genuinely on-model" half is semantic. A wave whose leverage is
cleanly falsifiable here should land before one whose leverage leans on
owner-verification. So S1 first stands.

Each wave is independently reviewable (a pure library + full test, no caller
until its stage surface in S6 - legal because the pure pieces are consumed by
their own tests and by S6, and S6 names each caller). Write sets are disjoint by
construction: every S1-S5 file is a new leaf under `src/lib/deck-standard/`; only
S6 touches the surface.

---

## 5. Pass conditions this shape introduces

Each names the OBJECT under comparison, the INSTRUMENT producing each quantity,
and the DIRECTION of failure. Gates naming two or more test files use
`npm run test:paths -- <p1> <p2> ...`, never a raw multi-path `vitest`
(`docs/loop/this-repo.md` section 1). The test seat owns oracle construction;
these supplement, not replace, the AC's instruments.

| id | Constraint | Object | Instrument | FAILS if |
|---|---|---|---|---|
| **DS-CHECK** | `checkDeckStandard` reports every violation of the effective standard, itemized | `checkDeckStandard(deck, standard)` output over a deck with a known title-case, title-slide-only, over-cap-bullets and long-title violation | `npx vitest run src/lib/deck-standard/standard.test.ts` | a real violation is missing from the receipt, OR the assertion still passes when a rule's check is deleted (SABOTAGE mandatory, one per rule) |
| **DS-PROVENANCE** | The `checkDeckStandard` result stamps the `standardVersion` that checked the deck - the stamp lives on the deck-standard-owned result `{ standardVersion, violations }`, NOT on `GeneratedDeck`/`DeckContent` | the `standardVersion` field of `checkDeckStandard(deck, DECK_STANDARD_V1)` against `DECK_STANDARD_V1.version` | same file | the result omits `standardVersion`, or it does not equal the standard that ran, OR the stamp is added as a field on the shared deck type |
| **FRAME-FOLD** | The Frame reaches every slide prompt BY CODE | the `callLlm` request text from a mocked generation, captured `mock.calls[0][0]` (the `sequence.test.ts:359` idiom, `docs/pres-1-architecture.md:44`) | `npx vitest run src/lib/deck-standard/frame.test.ts` | the captured prompt omits the mental-model step names; SABOTAGE: deleting the frame-fold line must turn this RED |
| **FRAME-DRIFT** | `frameConsistencyReceipt` flags a slide that mentions neither the model nor the example | the per-slide mention count for a deck with one on-model and one off-model slide | same file | an off-model slide is reported as on-model, or vice versa |
| **PLAN-SEPARATION** | A prediction and its answer are never one slide | the `SlidePlan` type + `validateSlidePlan` over a plan with a prediction/answer pair | `npx vitest run src/lib/deck-standard/slide-plan.test.ts` | the type admits a single "question+answer" variant (compile-time), OR `validateSlidePlan` passes an orphan prediction/answer; SABOTAGE: an orphan must be caught |
| **CHECKLIST-COMPLETE** | Every checklist question runs; none is silently skipped | the receipt of ran-question ids against `INFO_FLOW_CHECKLIST`/`VISUAL_CHECKLIST` ids | `npm run test:paths -- src/lib/deck-standard/checklists.test.ts` | a question id is missing from the receipt (the lengthened-denylist failure, `docs/loop/seats.md:115-123`, in checklist form) |
| **CHECKLIST-OPT-IN** | A finding is surfaced, never auto-applied | the finding-to-op mapping returns an UNAPPLIED op the caller must choose to run | same file | applying a finding mutates the deck without a caller decision (black-box improved deck) |
| **POLISH-IDEMPOTENT** | The polish pass is deterministic and stable | `polishDeck(polishDeck(deck).deck).changes` | `npx vitest run src/lib/deck-standard/polish.test.ts` | a second pass reports further changes (non-idempotent), or a first pass alters content it should only reformat |
| **CORE-INHOUSE** | Every model call is `@/lib/llm` `callLlm`; no external SDK or non-in-house `fetch` | imports+source of `src/lib/deck-standard/*` | source-text test: `grep -rniE "openai\|anthropic\|fetch\(\|iframe\|office.com\|docs.google" src/lib/deck-standard` -> exit 1 (canary `grep -rc "callLlm" src/lib/deck-standard`) | any external generation egress or embedded external viewer appears |
| **PIPE-BUDGET** | The pipeline adds no required step, mode switch, or course prerequisite | the count of REQUIRED inputs the surface gains (must be 0 beyond source intake) | reading the surface (no component renders); owner verification walking it | a stage is mandatory before an existing action, or a course must be selected first |
| **PIPE-REACH** (S6 concern) | Each stage's intermediate is editable and honored downstream | the call chain: edit Frame/plan/standard -> only affected slides regenerate. NOTE: this granular per-slide regeneration is NEW S6 code, NOT `regenerateArtifact` (which regenerates a whole artifact via `parseDeckSlides`, `generate.ts:135`) | source-text wiring test (reading claim), against the S6 regeneration code once designed | an edited intermediate is ignored, or a full regeneration re-runs unaffected slides |

DS-CHECK, DS-PROVENANCE, FRAME-FOLD, FRAME-DRIFT, PLAN-SEPARATION,
CHECKLIST-COMPLETE, CHECKLIST-OPT-IN, POLISH-IDEMPOTENT, CORE-INHOUSE are
pure/mocked-`callLlm` and verifiable here. PIPE-BUDGET and PIPE-REACH's render
half are reading + owner-verification claims (nothing renders under vitest).

---

## 6. The `owns` set (derived, command and output pasted)

The files each PRES-2 wave EDITS plus the tests that read those files AS SOURCE
TEXT (a test that greps a string it does not own goes red when the string moves,
`docs/loop/seats.md` core rule). S1-S5 create only NEW leaves under
`src/lib/deck-standard/`, which no existing test reads; the repo-wide scanners
apply to every new file. S6 (surface) is where the presentations owns set binds.

Readers of the surface PRES-2's S6 would touch, from the Bash tool:

```
$ grep -rln "lib/presentations\|components/presentations" --include=*.test.ts src/ | sort
src/app/api/presentations/generate/route.test.ts
src/app/components/presentations/panel-logic.test.ts
src/lib/presentations/parse.test.ts
    canary: grep -rln "presentations" --include=*.test.ts src/ | wc -l  -> 8
```

Classification:
- **`src/lib/deck-standard/*` (S1-S5, NEW)** - no existing test reads these
  files; they are OWNED generically by the repo-wide scanners
  (`src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`,
  `src/source-bytes.structure.test.ts`) - each new file is subject to them.
- **`src/lib/presentations/parse.test.ts`, `panel-logic.test.ts`,
  `api/presentations/generate/route.test.ts`** - OWNED (adopted) ONLY IF S6
  edits their targets (F1). If S6 composes `slideStructureRequirements` into
  `buildDeckPrompt` (`prompts.ts`) or changes the route body, these must stay
  green and the S6 implementer runs them at the wave gate. If S6 lands on a new
  surface instead, they are checked-safe.
- **`src/lib/slide-prompt.*` and `src/lib/slide-graphics.*` tests** (9 files,
  section survey) - CHECKED-SAFE: PRES-2 reuses these modules unchanged and
  writes none of them. Named so no wave edits them by reflex.

An implementer re-derives this per wave once F1 fixes the surface, because the
S6 owns set is not final until then.

---

## 7. Leverage

PRES-2 earns **CORPUS** (`docs/loop/leverage.md:37`) compounding with
**GUARANTEED** (`:44`) and **SCALE** (`:41`). Named per the one rule (a mechanism,
not a benefit, `leverage.md:12`), with the code that would have to be deleted for
the claim to become false:

- **GUARANTEED, earned:** `checkDeckStandard(deck, standard)` (2.1) holds the
  owner's stage 5/7/9 rules regardless of what the model returns - a chat's
  output is prose all the way down and nothing downstream can tell a rule-abiding
  title from a plausible one. The prediction/answer separation (2.3) is held by
  the TYPE: the app cannot spoil its own poll because "question+answer on one
  slide" is unrepresentable, the A43-C construction move.
- **CORPUS, earned:** the `DeckStandard` is versioned and STAMPED via the
  `checkDeckStandard` result (`{ standardVersion, violations }`, not a field on the
  shared deck model), and persisted (constant + `ta-` override) so a LATER act -
  next week's deck, a later session - reads back the exact rule-set and Frame. A
  chat re-types the standing rules every session and cannot report which version
  produced last week's deck.
- **SCALE, earned:** the same standard + template + Frame applied across a term's
  weeks, terms held constant, is the `gradeStudentEntries`-shaped advantage
  (`leverage.md:41`) transposed to authoring: one rule-set looped over N lectures.

**Earned, not inherited (the failure-mode-B test, `leverage.md:79-83`):** the
mechanism is a NEW `checkDeckStandard` + a stamped version, not a shared import
every module already has. `grep -rniE "deck-?standard|checkDeckStandard" --include=*.ts src/`
-> exit 1 today: no comparable module carries it.

**The removal test (S1's one acceptance criterion, owned by the test seat):**
delete any rule's branch in `checkDeckStandard` and its `StandardViolation`
entries disappear from the receipt for a deck that violates that rule (DS-CHECK's
sabotage). Direction: RED on removal of the rule check. This is a real removal
test, not "a chat could not do it": the deleted line is the code that makes the
claim true. Where a stage's advantage is clicks/latency/attention (the pipeline's
low-interaction editing), no removal test is buildable here (nothing renders) -
recorded as RES-PRES2-3 with an owner and a step, per `leverage.md:181-183`.

---

## 8. The forks this seat cannot decide (terminating owner questions)

Each is phrased so EVERY answer ends the activity (`AGENTS.md`, two-rounds rule).
A recommended reading is given per this repo's rules; the genuine product calls
are marked. None blocks S1-S5, which are surface-independent and can start now.

**F1 - THE SURFACE FORK (genuine product call).** The method spans two tabs
(section 0): PRES-1 "Slide Deck Creation" (free-context, no template) and
ppt-design (A43 template + A43-C ops + the rich contract). Where does the
13-stage pipeline live, and how do the template-conformance (A43) and
conversational ops (A43-C) reach it?
- (a) Pipeline on the PRES-1 presentations surface; bring template-fill in as an
  optional downstream export (wire the shipped `fillDeckTemplateFileAction`) and
  bring A43-C's apply step over when C2 lands.
- (b) Converge everything onto ppt-design; retire or fold the PRES-1 surface.
- (c) Pipeline on presentations; template-fill DEFERRED entirely (decks stay
  built-from-scratch); apply-a-finding still uses A43-C ops.
- **Recommendation: (a).** The owner's row names "Slide Deck Creation" (PRES-1)
  as the surface, PRES-1 is the free-context authoring flow the method starts
  from (stage 1), and the pure core (S1-S5) is surface-independent so it commits
  to nothing. Template-fill is already a shipped action reachable as an export.
  Answer terminates: it fixes S6's owns set and where the pipeline UI is built.

**F2 - DECK STANDARD SCOPE (genuine product call).** Per-course, per-instructor,
or global?
- **Recommendation: global versioned code constant (`DECK_STANDARD_V1`) plus an
  optional per-instructor `ta-` override for v1; per-course DEFERRED.** Per-course
  needs a table and RLS, which this checkout cannot verify
  (`docs/loop/this-repo.md` section 6), so shipping it would put an unverifiable
  guarantee in the critical path. Answer terminates: it fixes where 2.1 stores
  the standard and whether a migration is in scope.

**F3 - PIPELINE EXECUTION MODE (genuine product call).** Unattended-then-edit
(run all 13 stages, then edit the result) or stage-gated-by-default (stop at each
stage for edit, "run to end" optional)?
- **Recommendation: stage-gated-by-default with a "run to end" option.** It
  matches the row's non-relaxable "every intermediate editable and honored
  downstream" and "granular control" constraints (`docs/backlog.yml:1098`) and
  the click-budget rule (edit before compounding an error is cheaper than
  redoing). Answer terminates: it fixes whether S6 is a stepper or a
  one-shot-then-editor.

**F4 - STAGE 6 VISUAL GENERATION SCOPE (genuine product call).** Are NEW diagram
types (DNS map, DOM tree, arrow-direction correctness) in PRES-2, or deferred?
- **Recommendation: DEFER new diagram types.** PRES-2 reuses the shipped 3-kind
  `SlideGraphic` vocabulary and `enforceGraphicsForApplied`; arrow-direction and
  "diagram implies something false" stay LLM checklist findings (stage 12, 2.4),
  not new structural types. `slide-graphics.ts:16-40` records the deliberate cost
  reasoning against adding kinds (a coercion path, a layout path, a pptxgenjs
  path per kind), and a chart/plot kind is excluded by the no-fabrication rule.
  Answer terminates: it fixes whether S-waves add to `slide-graphics.ts` (which
  would then enter the write set) or leave it unchanged.

**F5 is NOT a fork, it is a dependency, stated so it is not mistaken for one:**
the checklist/standard APPLY step (one-click fix) routes through A43-C's
`applyDeckOperation` and needs A43-C's C2 surface (`docs/a43-c-scope.md:568`),
which is in flight. PRES-2's FIND steps do not depend on C2; only APPLY does.

---

## 9. Residual register

Each names an OWNER, an INSTRUMENT, the OBJECT/DIRECTION of failure, and the
STEP. A residual not in `docs/BACKLOG.md` does not exist
(`docs/DEV_LOOP.md` step 0); this pass does NOT write the backlog
(`docs/backlog.yml`/`docs/BACKLOG.md` are outside its write set), so each is owed
a backlog row by whoever lands the first PRES-2 wave.

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-PRES2-1 | F1 (surface fork) must be answered before S6; until then S6's owns set and pipeline home are unfixed. S1-S5 are unaffected. | Repo owner (product call) | This document section 8, F1 | The pipeline surface against the row's "Slide Deck Creation" target. FAILS if S6 is built before F1 is settled. | Owner answers F1; then the plan seat cuts S6. |
| RES-PRES2-2 | Per-course Deck Standard (F2) needs a table + RLS, unverifiable here. | Repo owner + a future data wave | A migration with a stored generated column and idempotent RLS (`docs/loop/seats.md:217-229`) | The per-course standard row against RLS. FAILS if per-course is shipped without a live-DB verification. | Deferred; owner verification on a deployed DB. |
| RES-PRES2-3 | The pipeline's low-interaction editing advantage (clicks/latency/attention) has NO removal test buildable here - nothing renders under vitest. | Repo owner | Walk the surface in a real browser; count clicks first-use and repeat-use (`docs/loop/seats.md:190-194`) | Observed click count against the budget. FAILS if a stage adds a required step. | Owner verification after S6. |
| RES-PRES2-4 | The polish linter (2.5) covers only model-representable "overlap"; true RENDERED visual overlap/spacing is a render property vitest cannot see. | Repo owner | Open a polished .pptx in PowerPoint | Rendered layout against "no overlap, consistent spacing". FAILS if a rendered slide overlaps despite a clean `polishDeck`. | Owner verification after S5. |
| RES-PRES2-5 | Whether the LLM checklist findings (2.4) and the model's on-Frame content (2.2) are genuinely faithful is unverifiable here (no API key; `vitest.setup.ts` throws on real `fetch`). | Repo owner | Generate a deck with a Frame, run the checklists, read the findings | The findings/content against the instruction. FAILS if a checklist misses a real flaw or the model drifts off-Frame (a quality claim, not a structural one). | Owner verification after S2/S4. |
| RES-PRES2-6 | A43-C C2 must land for the APPLY step (F5 dependency). | The A43-C C2 chunk | `git log` for the C2 commit touching `ppt-design/GeneratePanel.tsx` | The apply-a-finding path against a shipped op surface. FAILS if PRES-2 claims one-click apply before C2. | Sequence S4-apply after C2. |

---

## 10. Disposition table

Not applicable: this is the FIRST scope for PRES-2. No prior PRES-2 artifact was
restructured, so there is no prior requirement to map to kept / handed-over /
withdrawn. (Where PRES-2 corrects the ROW'S draft stage map, section 1 states the
correction inline; the row is a queue record, not a prior design artifact.)

---

## 11. What this environment cannot verify (stated, not worked around)

- **Any model output.** No API key; the network is blocked. Every `callLlm` path
  (Frame threading, checklist findings) is exercised only through mocks
  (RES-PRES2-5).
- **The pipeline surface's appearance, focus order, keyboard behaviour, click
  budget, and any deck PREVIEW/download.** No component renders under vitest -
  reading + owner-verification claims only (RES-PRES2-3).
- **Rendered visual polish / overlap** (RES-PRES2-4).
- **A per-course Deck Standard table and its RLS** - no live database
  (RES-PRES2-2).
- **Whether a produced .pptx opens correctly in PowerPoint** - inherited from
  PRES-1 / A43, unchanged by PRES-2 (it reuses the same writer).

---

## 12. Instruments used in this pass

Reproducible from the repo root at HEAD `56be148b`, 2026-09-29. Absence claims
run WITHOUT a pipe (so `$?` is grep's), each with a canary.

```
git rev-parse --short HEAD                                              -> 56be148b
grep -rniE "deck-?standard|pinned-?frame|slide-?plan|polishDeck|checkDeckStandard" --include=*.ts src/  -> exit 1
grep -rniE "title ?case|titleCase|titleCaseToolKey|toTitleCase" --include=*.ts src/lib src/app  -> src/lib/embedded/* (scaffold), src/lib/embedded-grader/rubric.ts:95, src/lib/resource-links.ts:264 - NONE on a slide-deck generation path (regex widened to catch camelCase identifiers)
grep -niE "concept ?plan|breadth|enumerat|sequenc" src/lib/decks/generate.ts  -> :10,168,178,235,345 (ppt-design path)
grep -rniE "prediction" --include=*.ts src/lib                          -> sole hit src/lib/research/case-studies.ts:272 (unrelated lesson string)
grep -rln "lib/presentations|components/presentations" --include=*.test.ts src/  -> 3 files (section 6)
    canary: grep -rln "presentations" --include=*.test.ts src/ | wc -l  -> 8
grep -rln "enforceTitleLength|slideStructureRequirements|SLIDE_DECK_JSON_SHAPE" --include=*.test.ts src/  -> 9 files (section 6)
@(Get-Content src/lib/slide-prompt.ts).Count                            -> 546
@(Get-Content src/lib/slide-graphics.ts).Count                          -> 482
@(Get-Content src/lib/pptx.ts).Count                                    -> 680
@(Get-Content src/lib/decks/generate.ts).Count                          -> 474
@(Get-Content src/lib/decks/deck-operations.ts).Count                   -> 233
@(Get-Content src/lib/decks/office-template-fill.ts).Count              -> 200
@(Get-Content src/lib/decks/fit-report.ts).Count                        -> 218
@(Get-Content src/app/api/decks/ask/route.ts).Count                     -> 155
@(Get-Content src/lib/presentations/prompts.ts).Count                   -> 92
@(Get-Content src/lib/presentations/generate.ts).Count                  -> 148
@(Get-Content src/lib/presentations/parse.ts).Count                     -> 116
@(Get-Content src/lib/presentations/types.ts).Count                     -> 87
@(Get-Content src/lib/presentations/deck-file.ts).Count                 -> 28
@(Get-Content src/app/components/presentations/index.tsx).Count         -> 202
@(Get-Content src/app/components/presentations/panel-logic.ts).Count    -> 283
@(Get-Content src/app/components/presentations/ArtifactCard.tsx).Count  -> 226
@(Get-Content src/app/api/presentations/generate/route.ts).Count        -> 291
```

Files opened directly for this pass: `src/lib/presentations/{prompts,generate,
parse,types}.ts`, `src/app/components/presentations/{index.tsx,panel-logic.ts,
ArtifactCard.tsx}`, `src/lib/slide-prompt.ts` (full), `src/lib/slide-graphics.ts`
(:1-210), `src/lib/pptx.ts` (:1-60), `docs/pres-1-architecture.md`,
`docs/a43-c-scope.md`, `docs/backlog.yml` (PRES-2 row), `docs/DEV_LOOP.md`,
`docs/loop/seats.md`, `docs/loop/leverage.md`.

Line counts above use `@(Get-Content).Count`, the mandated PowerShell instrument;
an implementer re-measures before trusting any headroom, since it and
`Measure-Object -Line` disagree by up to 42 on one file in this repo
(`docs/loop/this-repo.md` section 3).
