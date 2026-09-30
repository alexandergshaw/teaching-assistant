// PRES-2 S6.6 tests: request builders, the response reducer, and the
// run-to-end planner in panel-logic.ts. Pure - no render, no fetch, no
// storage; every fixture is a plain PipelineState built via
// createInitialPipelineState() + explicit per-stage overrides.

import { describe, expect, it } from "vitest";
import {
  buildPipelineRequest,
  reducePipelineResponse,
  runToEnd,
} from "./panel-logic";
import {
  createInitialPipelineState,
  type PipelineState,
  type StageId,
  type StageState,
} from "@/lib/presentations/pipeline";
import type {
  ActivitiesContent,
  DeckContent,
  OutlineContent,
  PresentationSource,
} from "@/lib/presentations/types";
import type { PinnedFrame } from "@/lib/deck-standard/frame";
import type { SlidePlan } from "@/lib/deck-standard/slide-plan";
import type { ChecklistResult } from "@/lib/deck-standard/checklists";
import type { PptxSlide } from "@/lib/pptx";

// ---------------------------------------------------------------------------
// Fixture helpers - explicit return types throughout (never `as <DomainType>`).
// ---------------------------------------------------------------------------

function stage<T>(status: StageState<T>["status"], artifact: T | null): StageState<T> {
  return { status, artifact };
}

function withStages(overrides: Partial<PipelineState>): PipelineState {
  return { ...createInitialPipelineState(), ...overrides };
}

function makeSources(): PresentationSource[] {
  return [{ name: "notes.txt", text: "raw notes" }];
}

function makeOutline(): OutlineContent {
  return { markdown: "# Outline" };
}

function makeActivities(): ActivitiesContent {
  return { ideas: ["idea one"] };
}

function makeFrame(): PinnedFrame {
  return {
    mentalModel: { name: "The Pipeline", steps: ["intake", "transform", "emit"] },
    runningExample: { name: "Order System", description: "an order flows through stages" },
  };
}

function makePlan(): SlidePlan {
  return { entries: [{ role: "content", dominantClaim: "claim one" }] };
}

function makeSlide(title: string): PptxSlide {
  return { title, bullets: ["b1"] };
}

function makeDeck(title: string, slides: PptxSlide[]): DeckContent {
  return { presentationTitle: title, slides };
}

function makeChecklistResult(): ChecklistResult {
  return { checklistVersion: "v1", findings: [], ranItemIds: [] };
}

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

describe("buildPipelineRequest", () => {
  it("builds the outline request from the pasted text and done sources", () => {
    const state = withStages({ sources: stage("done", makeSources()) });
    const req = buildPipelineRequest("outline", state, "pasted context text");
    expect(req).toEqual({
      op: "outline",
      context: { text: "pasted context text", sources: makeSources() },
    });
  });

  it("builds the plan request carrying context + the done outline + frame", () => {
    const state = withStages({
      sources: stage("done", makeSources()),
      outline: stage("done", makeOutline()),
      frame: stage("done", makeFrame()),
    });
    const req = buildPipelineRequest("plan", state, "ctx");
    expect(req).toEqual({
      op: "plan",
      context: { text: "ctx", sources: makeSources() },
      outline: makeOutline(),
      frame: makeFrame(),
    });
  });

  it("builds the plan request with frame null when frame has not run yet", () => {
    const state = withStages({
      sources: stage("done", makeSources()),
      outline: stage("done", makeOutline()),
    });
    const req = buildPipelineRequest("plan", state, "ctx");
    expect(req).toMatchObject({ op: "plan", frame: null });
  });

  it("builds the deck request carrying context + frame + plan pulled from the done stages", () => {
    const state = withStages({
      sources: stage("done", makeSources()),
      frame: stage("done", makeFrame()),
      plan: stage("done", makePlan()),
    });
    const req = buildPipelineRequest("deck", state, "ctx");
    expect(req).toEqual({
      op: "deck",
      context: { text: "ctx", sources: makeSources() },
      frame: makeFrame(),
      plan: makePlan(),
    });
  });

  it("builds the regen-slide request with the full deck + slideIndex + instruction", () => {
    const deck = makeDeck("Deck", [makeSlide("S0"), makeSlide("S1")]);
    const state = withStages({
      sources: stage("done", makeSources()),
      frame: stage("done", makeFrame()),
      plan: stage("done", makePlan()),
      deck: stage("done", deck),
    });
    const req = buildPipelineRequest("regen-slide", state, "ctx", {
      slideIndex: 1,
      instruction: "make it punchier",
    });
    expect(req).toEqual({
      op: "regen-slide",
      context: { text: "ctx", sources: makeSources() },
      frame: makeFrame(),
      plan: makePlan(),
      deck,
      slideIndex: 1,
      instruction: "make it punchier",
    });
  });

  it("throws building regen-slide without the extras", () => {
    const deck = makeDeck("Deck", [makeSlide("S0")]);
    const state = withStages({
      plan: stage("done", makePlan()),
      deck: stage("done", deck),
    });
    expect(() => buildPipelineRequest("regen-slide", state, "ctx")).toThrow();
  });

  it("throws building a request for a stage whose upstream artifact has not run yet", () => {
    // outline is still idle/null - the plan op REQUIRES it.
    const state = createInitialPipelineState();
    expect(() => buildPipelineRequest("plan", state, "ctx")).toThrow(/outline/);
  });
});

// ---------------------------------------------------------------------------
// Response reducer - ok maps to applyStageEdit (downstream goes stale);
// anything else marks ONLY that stage "error" and leaves every sibling
// untouched. Both halves proven non-vacuously: an ok reduction actually
// changes status to "done" AND stales the right downstream stages; a
// non-ok reduction is proven to NOT do that (asserts status !== "done").
// ---------------------------------------------------------------------------

describe("reducePipelineResponse", () => {
  it("ok: applies the outline artifact and marks downstream (plan/deck/...) stale", () => {
    const deck = makeDeck("Deck", [makeSlide("S0")]);
    const state = withStages({
      sources: stage("done", makeSources()),
      outline: stage("done", makeOutline()),
      plan: stage("done", makePlan()),
      deck: stage("done", deck),
      reviewInfoFlow: stage("done", makeChecklistResult()),
    });

    const newOutline: OutlineContent = { markdown: "# revised outline" };
    const next = reducePipelineResponse(
      "outline",
      200,
      { op: "outline", status: "ok", outline: newOutline },
      state
    );

    expect(next.outline).toEqual({ status: "done", artifact: newOutline });
    // outline's dependents (plan) and plan's dependents (deck, and deck's
    // dependents) all go stale - the SAME invalidation graph applyStageEdit
    // already owns; this proves the reducer actually delegates to it.
    expect(next.plan.status).toBe("stale");
    expect(next.deck.status).toBe("stale");
    expect(next.reviewInfoFlow.status).toBe("stale");
    // sources itself is untouched (not a dependent of outline).
    expect(next.sources).toEqual(state.sources);
  });

  it("ok: regen-slide folds the returned slides into the existing deck and stales reviews/polish", () => {
    const originalDeck = makeDeck("My Deck", [makeSlide("S0"), makeSlide("S1")]);
    const state = withStages({
      deck: stage("done", originalDeck),
      reviewVisual: stage("done", makeChecklistResult()),
    });
    const newSlides: PptxSlide[] = [makeSlide("S0"), { title: "S1 revised", bullets: ["punchier"] }];

    const next = reducePipelineResponse(
      "regen-slide",
      200,
      { op: "regen-slide", status: "ok", slides: newSlides },
      state
    );

    expect(next.deck.status).toBe("done");
    expect(next.deck.artifact).toEqual({ presentationTitle: "My Deck", slides: newSlides });
    expect(next.reviewVisual.status).toBe("stale");
  });

  it("error: a 502 PipelineErrorResponse marks only that stage error, no other stage mutates", () => {
    const state = withStages({
      sources: stage("done", makeSources()),
      outline: stage("done", makeOutline()),
    });

    const next = reducePipelineResponse(
      "frame-suggest",
      502,
      { status: "error", reason: "model call failed" },
      state
    );

    expect(next.frame.status).toBe("error");
    expect(next.frame.status).not.toBe("done");
    // Every other stage is untouched, proving the reducer never mutates
    // siblings on a failure.
    expect(next.sources).toEqual(state.sources);
    expect(next.outline).toEqual(state.outline);
    expect(next.plan).toEqual(state.plan);
  });

  it("never reduces a non-ok body as ok, even at HTTP 200 (refused/malformed proof)", () => {
    const originalDeck = makeDeck("Deck", [makeSlide("S0")]);
    const state = withStages({
      frame: stage("done", makeFrame()),
      plan: stage("done", makePlan()),
      deck: stage("done", originalDeck),
    });

    // Simulates a response the wire contract does not define an "ok" shape
    // for (a "refused"-like status, or an ok=200 with the wrong op/field) -
    // the reducer's single non-ok branch must catch it, never apply it.
    const refusedLike = { op: "deck", status: "refused", reason: "declined" };
    const next = reducePipelineResponse("deck", 200, refusedLike, state);

    expect(next.deck.status).toBe("error");
    expect(next.deck.artifact).toEqual(originalDeck); // artifact left in place
    expect(next.deck.status).not.toBe("done");
  });

  it("error: a malformed 200 ok body (missing the op's own field) is treated as error, not ok", () => {
    const state = createInitialPipelineState();
    const malformed = { op: "outline", status: "ok" }; // no `outline` field
    const next = reducePipelineResponse("outline", 200, malformed, state);
    expect(next.outline.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Run-to-end planner: the ordered frontier of stages runnable right now.
// ---------------------------------------------------------------------------

describe("runToEnd", () => {
  it("from a fresh pipeline, only sources (no deps) is runnable", () => {
    const state = createInitialPipelineState();
    expect(runToEnd(state)).toEqual(["sources"]);
  });

  it("once sources is done, outline/activities/frame become the frontier (deps respected, topological order)", () => {
    const state = withStages({ sources: stage("done", makeSources()) });
    expect(runToEnd(state)).toEqual(["outline", "activities", "frame"]);
  });

  it("skips a done-and-fresh stage (does not re-run it)", () => {
    const state = withStages({
      sources: stage("done", makeSources()),
      outline: stage("done", makeOutline()),
    });
    const plan = runToEnd(state, "outline");
    expect(plan).not.toContain("sources");
    expect(plan).not.toContain("outline");
  });

  it("re-includes a stale stage once its own deps are satisfied", () => {
    const state = withStages({
      sources: stage("done", makeSources()),
      frame: stage("done", makeFrame()),
      plan: stage("done", makePlan()),
      deck: stage("stale", makeDeck("Deck", [makeSlide("S0")])),
    });
    expect(runToEnd(state, "deck")).toContain("deck");
  });

  it("PROBE: a stage with an unmet dependency is NOT scheduled, nor is anything depending on it", () => {
    // outline is idle (never run) -> plan (depends on outline) cannot run yet,
    // and deck (depends on plan) transitively cannot run yet either - even
    // though frame (deck's OTHER dependency) is already done.
    const state = withStages({
      sources: stage("done", makeSources()),
      frame: stage("done", makeFrame()),
      // outline, plan, deck all left idle/null.
    });

    const plan = runToEnd(state, "deck");

    expect(plan).not.toContain("plan"); // unmet dep: outline not done
    expect(plan).not.toContain("deck"); // transitively blocked via plan
    expect(plan).toContain("outline"); // outline itself has no unmet dep (sources is done)
    expect(plan).toContain("activities");
  });

  it("respects an explicit target: nothing past the target stage is included", () => {
    const state = withStages({ sources: stage("done", makeSources()) });
    const plan = runToEnd(state, "frame");
    expect(plan).toEqual(["outline", "activities", "frame"]);
    expect(plan).not.toContain("plan");
    expect(plan).not.toContain("deck");
  });
});
