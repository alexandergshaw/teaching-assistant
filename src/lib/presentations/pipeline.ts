// PRES-2 S6.3: the pipeline core - the stage-state model, the invalidation
// (staleness) graph, and the route request/response WIRE CONTRACT types.
//
// This is a PURE leaf (docs/pres-2-s6-plan.md section 4, S6.3 row): no IO, no
// callLlm, no React. Its production callers are named later waves (S6.5's
// route and S6.6's client logic, per the plan's caller-rule note); in THIS
// wave the only caller is pipeline.test.ts, which is the sanctioned
// "consumed by its own tests, named downstream caller" shape the plan reuses
// from S1-S5 (docs/pres-2-scope.md:386-390, cited in the plan section 4).
//
// Every stage's editable intermediate is a REAL leaf/shared type, imported
// verbatim rather than re-declared (the plan section 3's PipelineState
// sketch, and the "one slide model in this app" policy already stated in
// presentations/types.ts).

import type { PresentationSource, PresentationContext, OutlineContent, ActivitiesContent, DeckContent } from "./types";
import type { PinnedFrame } from "@/lib/deck-standard/frame";
import type { SlidePlan, SlidePlanEntry } from "@/lib/deck-standard/slide-plan";
import type { CheckResult } from "@/lib/deck-standard/types";
import type { ChecklistResult } from "@/lib/deck-standard/checklists";
import type { PolishResult } from "@/lib/deck-standard/polish";
import type { PptxSlide } from "@/lib/pptx";

// ---------------------------------------------------------------------------
// 1. The stage-state model
// ---------------------------------------------------------------------------

/**
 * The pipeline's stage set. This is the STATE-CONTAINER granularity (one
 * field per editable intermediate in the plan section 3 sketch), which is
 * coarser than the owner's 13-step teaching narrative: several of the
 * narrative's numbered steps (stages 3/4 share `frame`; stages 5/9 share
 * `plan`; stages 11/12 are `reviewInfoFlow`/`reviewVisual`) are ONE editable
 * artifact each, because that is what a person actually edits and what an
 * edit invalidates. `sources` is stage 1; `standard` is stage 7 (pure,
 * recomputed on demand per the plan); `polish` is stage 13.
 */
export type StageId =
  | "sources"
  | "outline"
  | "activities"
  | "frame"
  | "plan"
  | "deck"
  | "standard"
  | "reviewInfoFlow"
  | "reviewVisual"
  | "polish";

export const ALL_STAGE_IDS: readonly StageId[] = [
  "sources",
  "outline",
  "activities",
  "frame",
  "plan",
  "deck",
  "standard",
  "reviewInfoFlow",
  "reviewVisual",
  "polish",
];

/** idle -> running -> done, or done -> stale (an upstream edit) -> running again; error on a failed run. */
export type StageStatus = "idle" | "running" | "done" | "stale" | "error";

/** One stage's editable intermediate plus its status. `artifact` is null until the stage has ever produced one. */
export interface StageState<T> {
  artifact: T | null;
  status: StageStatus;
}

function idleStage<T>(): StageState<T> {
  return { artifact: null, status: "idle" };
}

/**
 * The pipeline's full state container. Field types are the leaf/shared types
 * VERBATIM (plan section 3): `frame` IS a `PinnedFrame`, `plan` IS a
 * `SlidePlan`, `standard` IS a `CheckResult`, etc. `reviews.infoFlow`/
 * `reviews.visual` in the plan's prose sketch are `reviewInfoFlow`/
 * `reviewVisual` here (flattened rather than nested, so both are ordinary
 * StageId members the invalidation graph and stage-status model treat
 * uniformly - nesting them under one `reviews` field would need a second,
 * inconsistent status-tracking shape for what is otherwise one stage each).
 */
export interface PipelineState {
  sources: StageState<PresentationSource[]>;
  outline: StageState<OutlineContent>;
  activities: StageState<ActivitiesContent>;
  frame: StageState<PinnedFrame>;
  plan: StageState<SlidePlan>;
  deck: StageState<DeckContent>;
  standard: StageState<CheckResult>;
  reviewInfoFlow: StageState<ChecklistResult>;
  reviewVisual: StageState<ChecklistResult>;
  polish: StageState<PolishResult>;
}

/** A fresh pipeline with every stage idle and no artifacts. */
export function createInitialPipelineState(): PipelineState {
  return {
    sources: idleStage(),
    outline: idleStage(),
    activities: idleStage(),
    frame: idleStage(),
    plan: idleStage(),
    deck: idleStage(),
    standard: idleStage(),
    reviewInfoFlow: idleStage(),
    reviewVisual: idleStage(),
    polish: idleStage(),
  };
}

// ---------------------------------------------------------------------------
// 2. The invalidation (staleness) graph
// ---------------------------------------------------------------------------

/**
 * The dependency edges, stated as "this stage's artifact is built FROM
 * these upstream stages". This is the single source of truth the
 * invalidation graph walks; `computeStale` never lists downstream sets by
 * hand, so there is exactly one place per plan section 3's prose to keep in
 * sync with the dependency edges:
 *
 *   - outline, activities, frame depend on sources (stage 1 feeds all
 *     three). `activities` is S6.3's amendment: its op request payload is
 *     `{ context: PresentationContext }` - textually the same shape as
 *     `outline`'s payload - and `PresentationContext` embeds
 *     `sources: PresentationSource[]` (presentations/types.ts), so it
 *     depends on `sources` exactly as `outline` does. Nothing consumes
 *     `activities` (the `deck` op payload is `{context, frame, plan}` -
 *     no `activities` field), so it has no dependents: editing it stales
 *     the empty set.
 *   - plan depends on outline (plan section 3: "editing outline marks plan
 *     ... stale"); plan does NOT depend on frame ("deck folds the frame;
 *     plan does not", plan section 3, verbatim).
 *   - deck depends on frame AND plan (both editing frame and editing plan
 *     mark deck stale). deck does NOT depend on activities (see above).
 *   - standard, reviewInfoFlow, reviewVisual, polish all depend on deck
 *     (editing deck marks "reviews, polish" stale and "recomputes the pure
 *     standard ... receipt" - modeled here as standard also depending on
 *     deck, since a recompute-on-demand is exactly what marking it stale
 *     produces for a caller that reruns every non-idle stage before
 *     trusting it).
 *
 * `standard`'s OWN config (the DeckStandard the owner edits) is not a
 * StageId in this graph - editing it "re-runs checkDeckStandard only" (plan
 * section 3), i.e. it has no dependents, which is exactly the empty
 * downstream set a leaf node in this graph already produces by having
 * nothing point to it.
 */
const STAGE_DEPENDENCIES: Record<StageId, readonly StageId[]> = {
  sources: [],
  outline: ["sources"],
  activities: ["sources"],
  frame: ["sources"],
  plan: ["outline"],
  deck: ["frame", "plan"],
  standard: ["deck"],
  reviewInfoFlow: ["deck"],
  reviewVisual: ["deck"],
  polish: ["deck"],
};

/**
 * The reverse edges (derived, never hand-maintained): for each stage, the
 * stages that list it as a dependency, i.e. its DIRECT dependents.
 */
function directDependents(stage: StageId): StageId[] {
  return ALL_STAGE_IDS.filter((candidate) => STAGE_DEPENDENCIES[candidate].includes(stage));
}

/**
 * Given a stage that was just edited/re-run, return every stage now STALE:
 * the transitive closure of its dependents (a dependent of a dependent is
 * also stale - e.g. editing `sources` stales `outline`, which stales `plan`,
 * which stales `deck`, which stales `standard`/`reviewInfoFlow`/
 * `reviewVisual`/`polish`). The edited stage itself is never included (it
 * just finished running - it is the CAUSE, not a casualty). Order is
 * unspecified; callers that need determinism sort the result themselves.
 *
 * `state` is accepted (per the plan section 3 signature,
 * `computeStale(state, editedStage): StageId[]`) for forward compatibility
 * with a future per-instance override (e.g. a stage the caller marked
 * "pinned"/exempt from invalidation), but this wave's graph is static and
 * does not branch on `state`'s contents.
 */
export function computeStale(state: PipelineState, editedStage: StageId): StageId[] {
  void state;
  const stale = new Set<StageId>();
  const queue: StageId[] = [...directDependents(editedStage)];

  while (queue.length > 0) {
    const next = queue.shift() as StageId;
    if (stale.has(next)) continue;
    stale.add(next);
    queue.push(...directDependents(next));
  }

  return [...stale];
}

/**
 * Apply an edit/re-run of `editedStage` to `state`: mark `editedStage` itself
 * `"done"` (it just produced `newArtifact`) and mark every stage
 * `computeStale` names `"stale"` (their artifact is left in place - the
 * plan's "editable intermediates, honored downstream" model keeps the last
 * good value visible until the stage is re-run - only the status changes).
 * Returns a NEW state; `state` is never mutated.
 */
/**
 * Marks one stage `"stale"` in `state`, keeping its existing artifact. A
 * small generic so the computed-property assignment stays type-checked
 * against the ONE stage's own `StageState<T>` rather than against the
 * intersection TypeScript would otherwise infer for an arbitrary `StageId`
 * key (the property value's type must vary WITH the key, which a plain
 * `Record<StageId, ...>` write cannot express - the cast below is the single
 * place that says so, rather than spreading `any` through the function).
 */
function markStale<K extends StageId>(state: PipelineState, stage: K): PipelineState {
  return { ...state, [stage]: { ...state[stage], status: "stale" } } as PipelineState;
}

export function applyStageEdit<K extends StageId>(
  state: PipelineState,
  editedStage: K,
  newArtifact: PipelineState[K]["artifact"]
): PipelineState {
  let next: PipelineState = {
    ...state,
    [editedStage]: { artifact: newArtifact, status: "done" },
  } as PipelineState;

  for (const staleStage of computeStale(state, editedStage)) {
    next = markStale(next, staleStage);
  }
  return next;
}

/**
 * Whether `stage` can be run right now: every stage it directly depends on
 * must have produced an artifact and not itself be stale/running (a stale
 * upstream stage must be re-run first - running downstream on a stale input
 * would silently work from the outdated value). A stage with no
 * dependencies (`sources`) can always run.
 */
export function canRunStage(state: PipelineState, stage: StageId): boolean {
  return STAGE_DEPENDENCIES[stage].every((dependency) => {
    const dependencyState = state[dependency];
    return dependencyState.artifact !== null && dependencyState.status === "done";
  });
}

// ---------------------------------------------------------------------------
// 3. The wire contract: per-op request/response types
// ---------------------------------------------------------------------------

/**
 * One op per callLlm-backed pipeline stage (plan section 1's "route" column
 * + section 4's S6.5 row + the carried correction for per-slide
 * regeneration). This is the exhaustive op set S6.5 (route) and S6.6
 * (client) both import and code against, so neither codes against the
 * other's shape.
 */
export type PipelineOp =
  | "outline"
  | "frame-suggest"
  | "plan"
  | "deck"
  | "activities"
  | "review-infoflow"
  | "review-visual"
  | "regen-slide";

/**
 * Per-op request payload (everything besides the `op` discriminant and the
 * auth the route itself resolves via `requireUser`). `regen-slide` carries
 * BOTH the brief's shape (the whole `deck` + `slideIndex` + `instruction`,
 * "NOT regenerateArtifact") and the plan section 1's info fact (`context` +
 * `frame` + the target's `planEntry`, "folding buildFrameFoldLines(frame) +
 * the entry's dominantClaim by code") - the two are not in tension: the
 * route derives `priorSlide` from `deck.slides[slideIndex]` and
 * `planEntry` from `plan`, so passing `deck`+`slideIndex`+`plan` lets the
 * route reconstruct exactly the `{context, frame, planEntry, priorSlide}`
 * inputs the plan names, while still matching the brief's literal
 * deck+index+instruction shape at the wire boundary. Divergence noted, not
 * silently resolved one way.
 */
interface PipelineRequestPayload {
  outline: { context: PresentationContext };
  "frame-suggest": { context: PresentationContext };
  plan: { context: PresentationContext; outline: OutlineContent; frame: PinnedFrame | null };
  deck: { context: PresentationContext; frame: PinnedFrame | null; plan: SlidePlan };
  activities: { context: PresentationContext };
  "review-infoflow": { deck: DeckContent };
  "review-visual": { deck: DeckContent };
  "regen-slide": {
    context: PresentationContext;
    frame: PinnedFrame | null;
    plan: SlidePlan;
    deck: DeckContent;
    slideIndex: number;
    instruction: string;
  };
}

/** One request to the pipeline route: exactly one op, its own payload fields inlined alongside `op`. */
export type PipelineRequest = {
  [Op in PipelineOp]: { op: Op } & PipelineRequestPayload[Op];
}[PipelineOp];

/** Per-op success payload: the ONE artifact that op produces. */
interface PipelineSuccessPayload {
  outline: { outline: OutlineContent };
  "frame-suggest": { frame: PinnedFrame };
  plan: { plan: SlidePlan };
  deck: { deck: DeckContent };
  activities: { activities: ActivitiesContent };
  "review-infoflow": { result: ChecklistResult };
  "review-visual": { result: ChecklistResult };
  "regen-slide": { slides: PptxSlide[] };
}

/**
 * A successful per-op response: `status: "ok"` plus that op's own artifact
 * field. Mirrors the shipped `/api/decks/ask` idiom
 * (`{status, slides|reason}`, cited by the plan section 2) generalized to
 * every op's own artifact name instead of a single `slides` field.
 */
export type PipelineSuccessResponse = {
  [Op in PipelineOp]: { op: Op; status: "ok" } & PipelineSuccessPayload[Op];
}[PipelineOp];

/** A failed response: no op-specific artifact, just a reason (the styled-502/504 idiom the plan cites for S6.5). */
export interface PipelineErrorResponse {
  status: "error";
  reason: string;
}

/** The full response union a caller must narrow on `status` (and, once `status === "ok"`, on `op`). */
export type PipelineResponse = PipelineSuccessResponse | PipelineErrorResponse;

// Re-exported so a caller building a `regen-slide` request/response, or any
// other op that touches a single plan entry, does not need a second import
// from deck-standard/slide-plan just for the entry type.
export type { SlidePlanEntry };
