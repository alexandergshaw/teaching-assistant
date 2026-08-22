# Visualizer coverage for the selection: link what exists, create what does not

A new bulk-bar row on the Modules view. ONE scan of the selected assignments,
quizzes, pages and files finds the concepts a student would understand better
from an interactive visual, and checks each against the visualizer app. The
scan's two halves then drive two separate, explicitly-confirmed actions:

- **Concepts that already have a visualizer page** can be inserted into a
  Canvas module as external-URL module items, so students reach the
  explanation from the module itself.
- **Concepts that have no page yet** can be created in the visualizer repo.

## Why these are one feature, not two

They were asked for separately, and they are two different actions with two
different confirmations and two different destinations (Canvas vs the
visualizer repo). But everything up to the decision point is identical:
gather the selection's materials, extract visualization-worthy concepts,
resolve each against the visualizer index. Building them separately would
mean two copies of that pipeline, two extraction prompts drifting apart, and
the instructor scanning the same selection twice to do both halves of one
job. One scan, two follow-up actions, is both less code and fewer clicks.

## What the visualizer actually is (read this before designing anything)

It is a **separate Next.js app in a different GitHub repo**
(`VISUALIZER_BASE_URL` / `VISUALIZER_REPO`, `src/lib/visualizer.ts:6-7`), not
a Canvas page and not a Supabase table. "Adding a visualizer page" means
`createVisualizerConceptAction` (`src/app/actions/visualizer.ts:95-255`)
LLM-authors a React component and **commits three files to that external
repo** (the component, the topic page, and `navItems.ts`).

That single fact drives most of the decisions below: this action's "add" half
is an outward-facing write to a repo outside this project, so it is gated
behind an explicit confirmation rather than fired by the same click that
scans.

## What already exists (reuse survey - vetted, do not rebuild)

| Need | Existing code | Where |
| --- | --- | --- |
| Turning a Modules selection into one flat materials text | `gatherSelectionMaterials` + `expandModuleSelection` | `src/lib/lms-generation/materials.ts:318, 457` |
| A server action that already does exactly the above for a selection | `buildSelectionChatContextAction` | `src/app/actions/selection-chat-context.ts` (shipped in the Ask AI chunk) |
| Reading the visualizer's concept index | `loadVisualizerIndexAction` + `parseNavItems` | `src/app/actions/live-class.ts`, `src/lib/visualizer.ts:295-323` |
| Matching a concept against that index | `resolveVisualizerLinks` | `src/lib/live-class/links.ts:186-204` |
| The pure "which concepts have no page" logic | `checkConceptsAgainstIndex`, `capGaps`, `buildCoverageReport` | `src/lib/workflows/visualizer-gap-audit.ts:70-126` |
| Finding one concept's existing page | `findVisualizerConceptAction` | `src/app/actions/visualizer.ts:35-79` |
| Creating one concept's page (the external-repo write) | `createVisualizerConceptAction` | `src/app/actions/visualizer.ts:95-255` |
| Which topics can receive a new concept | `creatableTopics()`, `topicByKey()`, `VISUALIZER_TOPICS` | `src/lib/visualizer.ts:124-279` |
| Concept-list parsing/clamping | `parseDeckConcepts`, `clampDeckConcepts` | `src/lib/workflows/deck-concepts.ts:22-84` |
| The bulk-bar row shell, busy/note conventions, aria rules | `DownloadSelectionSection`, `AskAiSelectionSection`, `useSelectionDownload` | `src/app/components/content-tab/modules/` |
| Two-click confirmation for a destructive/outward action | `confirmArming.ts` (`isConfirmArmed`, `selectionSignature`) | `src/app/components/content-tab/modules/confirmArming.ts`, used by `useBulkModuleActions.bulkDeleteModules` |

**`TOPIC_TO_DIR_MAP` / `TOPIC_TO_EXPORT_MAP` are documented as stale
(`visualizer.ts:95-99`). Use `topicByKey()` / `creatableTopics()` only.**

## Decisions

**D1. Two steps, not one (user's call, and this repo's rule for side
effects).** The first click scans and reports; nothing is written. Creating
pages requires a second, explicit confirmation naming exactly what will be
created and where. Rationale: each created concept is three commits to an
external repo authored by an LLM. A single mis-click on a large selection
would otherwise push dozens of unreviewed pages into a repo this project does
not own.

**D2. Concepts are filtered for visualization-worthiness (user's call).** A
new extraction prompt asks specifically for concepts a student would grasp
better from an interactive visual - state changes, control flow, data
structures, algorithms, sequencing - and explicitly rejects concepts a visual
would not help with (definitions, policies, admin instructions). Every
existing extraction prompt asks only for "teachable concepts" and would drag
in the assignment's submission instructions.

**D3. `extractDeckConceptsAction` is NOT reused verbatim.** Its prompt is
framed "Below is a lecture slide deck", and its embedded-provider fallback
(`conceptsFromSlideTitles`, `deck-concepts.ts:93-112`) only recognises
`## heading` and `Slide N:` lines. Fed an assignment body it returns nothing,
silently - the exact "ships dead under one provider" failure this repo has
been bitten by. A new action with an honest name and an honest fallback is
written instead; `parseDeckConcepts` / `clampDeckConcepts` (which are pure and
shape-agnostic) ARE reused.

**D4. A Modules-screen bulk action, not a workflow step.** It stays outside
`STEP_REGISTRY`, so `HEADLESS_SAFE_STEP_TYPES`' count canary
(`headless.test.ts`), the step-bucket exhaustiveness test, and both preset
oracle files are untouched. Exposing this as an Automate step is a separate,
later decision.

**D5. Live-Canvas selections only**, inheriting the existing boundary - the
Modules bulk bar's item selection is live-tree only, and repo-sourced items
are excluded from `selectedMaterialItems()` by design.

## Fixed contracts (three file sets are built concurrently against these)

### Contract 1 - the pure leaf: `src/lib/visualizer/selection-coverage.ts` (NEW, set A)

No React, no DOM, no `@/app/actions`, no network. Sets B and C import from it.

```ts
export const VISUALIZER_SCAN_MAX_CONCEPTS = 20;   // matches clampDeckConcepts' own ceiling
export const VISUALIZER_LINK_MAX_ITEMS = 40;

/** One concept the extractor found, with the material that justified it. */
export interface ScannedConcept { concept: string; evidence: string }

/** A concept resolved against the visualizer index - the raw input to
 *  classification. `url`/`topicKey`/`label` are null when nothing matched. */
export interface ConceptResolution {
  concept: string;
  evidence: string;
  url: string | null;
  topicKey: string | null;
  label: string | null;
  /** Whether the matched topic can receive a new concept (creatableTopics). */
  creatable: boolean;
}

export interface CoveredConcept { concept: string; url: string; topicKey: string; label: string }
export interface GapConcept { concept: string; evidence: string; reason: "no-match" | "topic-not-creatable" }
export interface SelectionCoverage { covered: CoveredConcept[]; gaps: GapConcept[] }

/** Pure split. A resolution with a url is covered; one without is a gap,
 *  tagged with WHY (nothing matched, vs matched a topic that cannot receive
 *  a new page - A4 requires these be distinguishable). Never throws. */
export function classifySelectionCoverage(resolutions: ConceptResolution[]): SelectionCoverage;

/** The Canvas module-item title for a covered concept. STABLE for a given
 *  concept (C4) - a re-run must produce the identical string, never a
 *  near-duplicate. */
export function visualizerLinkTitle(concept: string): string;

/** Covered concepts whose url is not already among the module's existing
 *  external-url items (C5). Compared on normalized url, not on title. */
export function unlinkedConcepts(covered: CoveredConcept[], existingExternalUrls: readonly string[]): CoveredConcept[];

/** The scan's own summary line (A5): how many concepts, how many covered,
 *  how many missing. */
export function coverageSummaryNote(coverage: SelectionCoverage): string;
```

### Contract 2 - the extractor: `src/app/actions/visualization-concepts-generator.ts` (NEW, set A)

```ts
"use server";

export async function extractVisualizationConceptsAction(
  materialsText: string,
  maxConcepts?: number,          // clamped by clampDeckConcepts
  provider?: LlmProvider         // default "gemini"
): Promise<{ concepts: ScannedConcept[] } | { error: string }>;
```

### Contract 3 - the server actions: `src/app/actions/visualizer-selection.ts` (NEW, set B)

```ts
"use server";

export interface VisualizerScanInput {
  courseUrl: string;
  courseId?: string;
  acronym?: string;
  items: SelectedMaterialItem[];
  moduleIds?: number[];
  provider?: LlmProvider;
}
export interface VisualizerScanSuccess {
  covered: CoveredConcept[];
  gaps: GapConcept[];
  /** Gather/extract notes, surfaced verbatim - never dropped. */
  notes: string[];
}
export async function scanSelectionForVisualizerCoverageAction(
  input: VisualizerScanInput
): Promise<VisualizerScanSuccess | { error: string }>;

export interface VisualizerLinkInput {
  courseUrl: string;
  acronym?: string;
  moduleId: number;
  concepts: CoveredConcept[];
}
export interface VisualizerLinkSuccess {
  linked: string[];                                    // concept names
  skipped: string[];                                   // already present (C5)
  failed: Array<{ concept: string; error: string }>;   // per-concept, non-fatal (C6)
}
export async function linkVisualizerPagesIntoModuleAction(
  input: VisualizerLinkInput
): Promise<VisualizerLinkSuccess | { error: string }>;

export interface VisualizerCreateInput { concepts: GapConcept[]; provider?: LlmProvider }
export interface VisualizerCreateSuccess {
  created: Array<{ concept: string; url: string }>;
  skipped: string[];                                   // gained a page since the scan (B4)
  failed: Array<{ concept: string; error: string }>;   // per-concept, non-fatal (B3)
}
export async function createVisualizerPagesForGapsAction(
  input: VisualizerCreateInput
): Promise<VisualizerCreateSuccess | { error: string }>;
```

### Contract 4 - the hook: `src/app/components/content-tab/modules/useVisualizerCoverage.ts` (NEW, set C)

```ts
export type VisualizerCoverageBusy = "" | "scan" | "link" | "create";

export interface UseVisualizerCoverageReturn {
  busy: VisualizerCoverageBusy;
  /** The last scan's result, or null before any scan / after a disarm. */
  coverage: SelectionCoverage | null;
  scan: () => void;
  /** Armed only while `coverage` has covered concepts and the target module
   *  is resolved; see C1/C2. */
  link: () => void;
  create: () => void;
  moduleChoice: string;
  setModuleChoice: (v: string) => void;
  moduleOptions: Array<{ id: number; name: string }>;
  /** Why link/create cannot run right now, or null - the reason strings the
   *  row renders next to the controls. */
  linkUnavailableReason: string | null;
  createUnavailableReason: string | null;
  /** True from the arming click until `link` either commits or is
   *  superseded (a re-scan, a selection change, or `create` being armed).
   *  Added post-launch (verified-findings blocker 1 - a two-click
   *  confirmation the DOM never reflected was crossable without ever being
   *  seen). This contract is a FLOOR, not a ceiling: drives the row's own
   *  button-label swap (BulkModulesSection.tsx:145's "Confirm delete"
   *  idiom) and its locally-rendered, aria-live confirmation banner. */
  linkArmed: boolean;
  /** Same as linkArmed, for `create`. */
  createArmed: boolean;
}
```

## Acceptance criteria

### A. Scanning (the first click)

**A1.** A new bulk-bar row renders whenever the bulk bar does, with a button
that scans the current selection. It sits alongside the existing read-only
rows (Download, Ask AI) and follows their exact visual, busy-state and
aria conventions.

**A2.** Scanning gathers the selection's materials with the SAME expansion
split every sibling uses: `expandModuleSelection` with the real tree for
display counts, with an empty live tree for the server payload, and
`liveModuleIdsFromKeys` for live module ids expanded server-side from a fresh
read. No repo-sourced key may reach the server payload.

**A3.** Concepts are extracted from that materials text by a new server
action implementing D2/D3. It returns a bounded list (reusing
`clampDeckConcepts`' 1-20 bound and default), each entry carrying the concept
and the evidence that produced it.

**A4.** Each extracted concept is checked against the visualizer's live index
via `loadVisualizerIndexAction` + `resolveVisualizerLinks` - never a
hand-rolled match. A concept whose matched topic is not `creatable` is a GAP,
carrying `reason: "topic-not-creatable"` so it is reported distinctly from a
concept nothing matched at all - and, being a gap with no working page, it is
never offered to the LINK action and never offered to the CREATE action
either.

(An earlier draft of this clause called such a concept
"covered-but-unextendable, not as a gap", which contradicts Contract 1's own
`GapConcept.reason` union. The contract is behaviourally right - there is no
working page to link a student to, so treating it as covered would put a dead
control in front of the instructor - and the implementation follows the
contract. The prose is corrected here so a later reader does not "fix" the
code to match the wrong half.)

**A5.** The scan result names, for the instructor: how many concepts were
found, which already have a visualizer page (with their URLs), and which do
not. It is a report, not a mutation - nothing is written to the visualizer
repo, to Canvas, or to Supabase on this path.

**A6.** The scan degrades honestly: an empty selection, a selection whose
materials produced no text, an extraction that found no visualization-worthy
concepts, and an unreachable visualizer index each produce a specific,
distinguishable message. "Found nothing" is never rendered as success.

### B. Creating (the second, explicit click)

**B1.** Creation is only reachable AFTER a scan has reported gaps, and only
through a control that names the count and states that pages will be
committed to the visualizer repo. It is armed per scan result: changing the
selection, or re-scanning, disarms it (`confirmArming.ts`'s
`selectionSignature` idiom, as `bulkDeleteModules` already uses).

**B2.** Creating iterates the approved gaps and calls
`createVisualizerConceptAction` per concept, passing the concept's evidence
from the scan as its `context` argument so the generated component is
grounded in the instructor's actual material.

**B3.** Per-concept failure is isolated and reported, never fatal to the run:
one concept that fails to generate or commit leaves the rest to proceed, and
the summary names which succeeded and which did not, with URLs for the ones
that now exist.

**B4.** A concept that gained a page between the scan and the confirmation is
re-checked and skipped rather than duplicated - the index is re-read at
creation time, never trusted from the scan.

**B5.** Nothing in this feature writes to Canvas or to the course tile.

### C. Linking covered concepts into a module (the other second click)

**C1.** When the scan found concepts that ALREADY have a visualizer page, a
control offers to insert links to them into a Canvas module. It is armed per
scan result exactly as B1's creation control is, and disarms on a selection
change or a re-scan.

**C2.** The target module defaults to the module the selection names, reusing
`defaultPostModuleChoiceFrom`
(`src/app/components/content-tab/modules/lmsGenerationModuleTarget.ts:91-137`)
- the same function and the same "one live module or nothing" rule the
generation post-target already uses. A selection spanning several modules, or
naming none, requires an explicit choice; it never guesses.

**C3.** Each link is inserted with `createModuleItemAction` as
`{ type: "ExternalUrl", externalUrl, title }`
(`src/app/actions/canvas-modules.ts:105-118`, `NewModuleItem`,
`src/lib/canvas-modules/types.ts:71-83`). No new Canvas helper is written -
this is the same call `useAddModuleItem` already makes for a manually-added
external URL.

**C4.** The item title names the concept in a form a student can act on, not
a bare URL, and is stable for a given concept so a re-run produces the same
title rather than a near-duplicate.

**C5.** Already-linked concepts are not duplicated. Before inserting, the
target module's existing items are re-read fresh and any item already
pointing at that visualizer URL is skipped and reported as already present -
mirroring `planPostSteps`' own `linkedPageUrls` check
(`src/lib/lms-generation/commit-plan.ts:210-224`).

**C6.** Per-link failure is isolated and reported, never fatal: one failed
insertion leaves the rest to proceed, and the summary names what was linked,
what was skipped as already present, and what failed.

**C7.** This action writes to Canvas and only to Canvas - never to the
visualizer repo. It is gated by `gateOperation(ctx, "courseWrite")` like every
other Canvas write in this tab, so an export-sourced selection refuses with
the established wording rather than failing at the API.

**C8.** `reload()` is called after a run that inserted anything, so the module
tree on screen shows the new items - the same rule every other Canvas write in
this view follows.

### D. Tests

**D1.** The concept-extraction action is unit-tested including its
no-LLM/embedded path - the specific failure D3 exists to prevent is a fallback
that silently returns an empty list, so a test must pin what that path does
with real assignment-shaped prose.

**D2.** The classification is tested against a frozen index fixture: covered,
missing, and matched-but-not-creatable each produce their documented outcome.
Covered and missing must be proven to route to the LINK action and the CREATE
action respectively - a scan that classifies correctly but feeds the wrong
half to the wrong action is the defect this pins.

**D3.** The arming/disarming of both second-click actions is tested: armed
only after a scan, disarmed by a selection change or a re-scan, and armed
independently of each other.

**D4.** The already-linked skip (C5) is tested against a module fixture that
already contains the visualizer URL, proving a re-run inserts nothing.

**D5.** The module-target default (C2) is tested for the single-module,
multi-module and no-module selections.

**D6.** Fixtures must match the shape the UI really emits - a suite whose
fixtures use a materials shape `gatherSelectionMaterials` never produces, or a
module-item shape Canvas never returns, proves nothing.

**D7.** Tests pin facts and ordering, never prose spelling.

## Out of scope

- Registering this as a workflow step (D4), and therefore any change to
  `headless.ts`, the step registry, or the preset oracles.
- Repo-sourced and export-sourced selections (D5).
- Changing the visualizer app itself, its topic list, or how a concept
  component is authored.
- Editing or deleting existing visualizer pages - this action only adds.
- Removing or re-ordering visualizer links already in a module. The link
  action only inserts, and only what is not already there (C5).
- Linking a concept whose page does not exist yet. The two halves stay
  independent on purpose: creating a page (B) does not auto-link it, because
  creation is an LLM authoring a component in another repo and the
  instructor should look at it before pointing students to it. Re-scanning
  after a create moves those concepts into the covered half, where the link
  action can then offer them.

## Sequencing

Third in the queue. Starts after the Ask AI chunk is pushed and after
`docs/learning-resources-page-acceptance-criteria.md` ships.
