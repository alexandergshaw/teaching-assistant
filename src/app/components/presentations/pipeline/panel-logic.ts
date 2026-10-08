// PRES-2 S6.6: pure client-side logic for the pipeline surface (PipelineTab,
// S6.7). Request builders (PipelineState -> PipelineRequest), a response
// reducer (PipelineResponse -> next PipelineState), and a pure run-to-end
// planner. No fetch, no DOM, no React - all IO (the actual route calls,
// localStorage) stays in the S6.7 .tsx per the plan's caller-rule note
// (docs/pres-2-s6-plan.md section 4, S6.6 row).
//
// Mirrors the shipped reducer idiom (panel-logic.ts's `reduceGenerateResponse`,
// ppt-design/ask-response.ts's `reduceAskResponse`): branch on BOTH the
// HTTP-status-equivalent and the JSON `status` field, so a malformed or
// unexpected body is never treated as success.
//
// DIVERGENCE from the brief's "refused/error/partial" framing: the S6.3 wire
// contract (`pipeline.ts`) defines only `PipelineSuccessResponse` (status:
// "ok") and `PipelineErrorResponse` (status: "error"; reason: string) - there
// is no third "refused" status distinct from "error", unlike the shipped
// `/api/decks/ask` contract `reduceAskResponse` mirrors. So this reducer
// collapses every non-ok outcome (error, a malformed 200 body, a 502/504/
// whatever the route eventually sends) into the SAME "mark that stage
// error" branch - there is nothing in the contract to discriminate a
// "refused" sub-case from a hard error. If S6.5 later grows a `refused`
// variant, this reducer's single non-ok branch is exactly where to add it.

import {
  ALL_STAGE_IDS,
  applyStageEdit,
  canRunStage,
  type PipelineOp,
  type PipelineRequest,
  type PipelineState,
  type PipelineSuccessResponse,
  type StageId,
} from "@/lib/presentations/pipeline";
import type { DeckContent, PresentationContext } from "@/lib/presentations/types";
import type { PptxSlide } from "@/lib/pptx";

// Re-exported so a consumer of this module (PipelineTab.tsx, S6.7) can apply a
// direct user edit to a stage's artifact (e.g. the Frame editor, or a
// non-route stage-1 "sources" commit) via the SAME import as the request
// builders and reducer below, without a second import from
// `@/lib/presentations/pipeline` just for this one function.
export { applyStageEdit };

// ---------------------------------------------------------------------------
// 1. Op -> stage mapping (the ONE place a PipelineOp's success maps onto a
//    PipelineState field). `regen-slide` is handled separately in the
//    reducer below: it does not carry a whole new `deck` artifact on the
//    wire (its success payload is `{ slides: PptxSlide[] }`, not
//    `{ deck: DeckContent }`), so it needs to be folded into the EXISTING
//    deck artifact rather than looked up here.
// ---------------------------------------------------------------------------

const OP_TO_STAGE: Record<Exclude<PipelineOp, "regen-slide">, StageId> = {
  outline: "outline",
  "frame-suggest": "frame",
  plan: "plan",
  deck: "deck",
  activities: "activities",
  "review-infoflow": "reviewInfoFlow",
  "review-visual": "reviewVisual",
};

function stageForOp(op: PipelineOp): StageId {
  return op === "regen-slide" ? "deck" : OP_TO_STAGE[op];
}

// ---------------------------------------------------------------------------
// 2. Request builders: PipelineState (+ any per-stage inputs not carried on
//    the state, e.g. the pasted context text, or a regen-slide target) ->
//    PipelineRequest. One dispatcher (`buildPipelineRequest`) plus the
//    per-op payload assembly, so a caller with just an op name and a state
//    gets a fully-typed request without knowing each op's payload shape.
// ---------------------------------------------------------------------------

/**
 * `PipelineState.sources` IS the sources half of `PresentationContext`; the
 * pasted free-text half (`PresentationContext.text`) is not a pipeline
 * stage (there is nothing to invalidate when it changes - the plan's stage
 * set has no `text` field), so it is threaded through here as a plain
 * argument rather than read off `state`.
 */
function buildContext(state: PipelineState, contextText: string): PresentationContext {
  return { text: contextText, sources: state.sources.artifact ?? [] };
}

/**
 * Read a stage's artifact, throwing if it is not yet produced. Every op that
 * needs an upstream artifact is only ever built after `canRunStage` gated it
 * (S6.7's responsibility per the plan), so this is a defensive assertion, not
 * a normal control-flow branch - it turns a caller bug (building a request
 * for a stage whose dependency never ran) into a loud failure instead of a
 * request carrying `null` where the wire contract requires a real artifact.
 */
function requireArtifact<K extends StageId>(
  state: PipelineState,
  stage: K
): NonNullable<PipelineState[K]["artifact"]> {
  const artifact = state[stage].artifact;
  if (artifact === null) {
    throw new Error(`buildPipelineRequest: stage "${stage}" has no artifact yet`);
  }
  return artifact as NonNullable<PipelineState[K]["artifact"]>;
}

/** Extra, non-state inputs `regen-slide` needs (which slide, and the edit instruction). */
export interface RegenSlideExtras {
  slideIndex: number;
  instruction: string;
}

export function buildPipelineRequest(
  op: PipelineOp,
  state: PipelineState,
  contextText: string,
  regenExtras?: RegenSlideExtras
): PipelineRequest {
  switch (op) {
    case "outline":
      return { op, context: buildContext(state, contextText) };
    case "frame-suggest":
      return { op, context: buildContext(state, contextText) };
    case "activities":
      return { op, context: buildContext(state, contextText) };
    case "plan":
      return {
        op,
        context: buildContext(state, contextText),
        outline: requireArtifact(state, "outline"),
        frame: state.frame.artifact,
      };
    case "deck":
      return {
        op,
        context: buildContext(state, contextText),
        frame: state.frame.artifact,
        plan: requireArtifact(state, "plan"),
      };
    case "review-infoflow":
      return { op, deck: requireArtifact(state, "deck") };
    case "review-visual":
      return { op, deck: requireArtifact(state, "deck") };
    case "regen-slide": {
      if (!regenExtras) {
        throw new Error("buildPipelineRequest: \"regen-slide\" requires slideIndex and instruction");
      }
      return {
        op,
        context: buildContext(state, contextText),
        frame: state.frame.artifact,
        plan: requireArtifact(state, "plan"),
        deck: requireArtifact(state, "deck"),
        slideIndex: regenExtras.slideIndex,
        instruction: regenExtras.instruction,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Response reducer: PipelineResponse (+ httpStatus, the op that was sent)
//    -> next PipelineState. On ok, delegates to `applyStageEdit` (which
//    marks downstream stale via the invalidation graph in pipeline.ts); on
//    anything else, marks ONLY that op's stage `"error"` and returns every
//    other stage untouched.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Shallow validation, same depth as the shipped `isOkBody`/`isRefusedBody` idiom: check the discriminants and the presence of the op's own payload field, not the field's internal shape. */
function isMatchingOkBody(op: PipelineOp, body: unknown): body is PipelineSuccessResponse {
  if (!isRecord(body) || body.status !== "ok" || body.op !== op) return false;
  switch (op) {
    case "outline":
      return isRecord(body.outline);
    case "frame-suggest":
      return isRecord(body.frame);
    case "plan":
      return isRecord(body.plan);
    case "deck":
      return isRecord(body.deck);
    case "activities":
      return isRecord(body.activities);
    case "review-infoflow":
      return isRecord(body.result);
    case "review-visual":
      return isRecord(body.result);
    case "regen-slide":
      return Array.isArray(body.slides);
  }
}

/** Marks one stage `"error"`, leaving its existing artifact and every other stage untouched. The `applyStageEdit`/`markStale` counterpart for a failed run. */
function markStageError<K extends StageId>(state: PipelineState, stage: K): PipelineState {
  return { ...state, [stage]: { ...state[stage], status: "error" } } as PipelineState;
}

/**
 * Returns a deck identical to `deck` except slide `slideIndex` is replaced by
 * `newSlide`. The deck length and every other slide are preserved by
 * construction. An out-of-range (or non-integer) index is a SAFE NO-OP: the
 * deck is returned unchanged.
 */
export function mergeRegeneratedSlide(deck: DeckContent, slideIndex: number, newSlide: PptxSlide): DeckContent {
  if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= deck.slides.length) return deck;
  return {
    ...deck,
    slides: deck.slides.map((slide, i) => (i === slideIndex ? newSlide : slide)),
  };
}

/**
 * Fold a `regen-slide` success (`{ slides: [oneSlide] }`, the route emits a
 * ONE-element array) into the existing `deck` artifact by splicing that slide
 * in at `slideIndex` via `mergeRegeneratedSlide`. Then routes through
 * `applyStageEdit("deck", ...)` exactly like any other deck-producing op, so
 * `reviews`/`polish` go stale the same way a full `deck` op's success would.
 * No existing deck, or an empty response, is an error for the deck stage.
 */
function applyRegenSlideSuccess(
  state: PipelineState,
  slides: PptxSlide[],
  slideIndex: number | undefined
): PipelineState {
  const currentDeck = state.deck.artifact;
  if (!currentDeck || slides.length === 0) return markStageError(state, "deck");
  const nextDeck = mergeRegeneratedSlide(currentDeck, slideIndex ?? -1, slides[0]);
  return applyStageEdit(state, "deck", nextDeck);
}

export function reducePipelineResponse(
  op: PipelineOp,
  httpStatus: number,
  body: unknown,
  state: PipelineState,
  regenSlideIndex?: number
): PipelineState {
  const stage = stageForOp(op);

  if (httpStatus === 200 && isMatchingOkBody(op, body)) {
    if (body.op === "regen-slide") {
      return applyRegenSlideSuccess(state, body.slides as PptxSlide[], regenSlideIndex);
    }
    switch (body.op) {
      case "outline":
        return applyStageEdit(state, "outline", body.outline);
      case "frame-suggest":
        return applyStageEdit(state, "frame", body.frame);
      case "plan":
        return applyStageEdit(state, "plan", body.plan);
      case "deck":
        return applyStageEdit(state, "deck", body.deck);
      case "activities":
        return applyStageEdit(state, "activities", body.activities);
      case "review-infoflow":
        return applyStageEdit(state, "reviewInfoFlow", body.result);
      case "review-visual":
        return applyStageEdit(state, "reviewVisual", body.result);
    }
  }

  // Anything else - the route's `PipelineErrorResponse`, a non-200 status, or
  // a malformed/unexpected 200 body - is an error for THIS stage only. Never
  // reduced as ok; every other stage's artifact/status is left exactly as it
  // was (the spread in `markStageError` only rewrites `stage`'s own entry).
  return markStageError(state, stage);
}

// ---------------------------------------------------------------------------
// 4. Run-to-end planner (F3): given a state and an optional target stage,
//    return the ORDERED list of stages runnable RIGHT NOW (the "next batch"
//    a client-driven sequential fan-out should call the route for, in
//    order). It is deliberately a FRONTIER, not the whole remaining chain:
//    it reads `canRunStage` against the state it was GIVEN, never simulates
//    a future artifact a not-yet-run stage would produce. The S6.7 sequencer
//    re-invokes this after each stage's response is reduced into a new
//    state, so the next call's frontier naturally includes what the
//    previous call's success just unblocked - that is the "sequencing"
//    (the actual awaiting/fetching loop is S6.7; this half is pure).
// ---------------------------------------------------------------------------

/**
 * `target` limits the plan to stages at or before it in `ALL_STAGE_IDS`'s
 * topological order (omit it to plan all the way to the end, i.e. `polish`).
 * A stage already `"done"` (fresh) is excluded; `"stale"`, `"idle"`, and
 * `"error"` all count as needing a run. A stage whose direct dependency is
 * not itself `"done"` in `state` is NOT scheduled (the "unmet dep" case) -
 * it, and anything depending on IT, is left for a later call once that
 * dependency has actually finished.
 */
export function runToEnd(state: PipelineState, target?: StageId): StageId[] {
  const targetIndex = target ? ALL_STAGE_IDS.indexOf(target) : ALL_STAGE_IDS.length - 1;
  const candidates = ALL_STAGE_IDS.slice(0, targetIndex + 1);

  return candidates.filter((stage) => {
    const needsRun = state[stage].status !== "done";
    return needsRun && canRunStage(state, stage);
  });
}
