// PRES-2 S6.6 tests: request builders, the response reducer, and the
// run-to-end planner in panel-logic.ts. Pure - no render, no fetch, no
// storage; every fixture is a plain PipelineState built via
// createInitialPipelineState() + explicit per-stage overrides.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyRegenDecision,
  buildPipelineRequest,
  deckFingerprint,
  extractRegenCandidate,
  isPipelineComplete,
  mergeRegeneratedSlide,
  reducePipelineResponse,
  runToEnd,
  shouldAutoDownloadDeck,
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
import type { CheckResult } from "@/lib/deck-standard/types";
import type { PolishResult } from "@/lib/deck-standard/polish";
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

  it("ok: regen-slide splices the ONE returned slide at slideIndex, preserving length and the other slides, and stales reviews", () => {
    const originalSlides: PptxSlide[] = [makeSlide("S0"), makeSlide("S1"), makeSlide("S2"), makeSlide("S3")];
    const originalDeck = makeDeck("My Deck", originalSlides);
    const state = withStages({
      deck: stage("done", originalDeck),
      reviewVisual: stage("done", makeChecklistResult()),
    });
    // The route emits a ONE-element array (parseRegenSlideResponse -> [slides[0]]).
    const revised: PptxSlide = { title: "S2 revised", bullets: ["punchier"] };

    const next = reducePipelineResponse(
      "regen-slide",
      200,
      { op: "regen-slide", status: "ok", slides: [revised] },
      state,
      2
    );

    expect(next.deck.status).toBe("done");
    expect(next.deck.artifact?.slides).toHaveLength(4);
    expect(next.deck.artifact).toEqual({
      presentationTitle: "My Deck",
      slides: [originalSlides[0], originalSlides[1], revised, originalSlides[3]],
    });
    expect(next.reviewVisual.status).toBe("stale");
  });

  it("regen-slide without a slideIndex leaves the deck's slides intact (never collapses it)", () => {
    const originalDeck = makeDeck("My Deck", [makeSlide("S0"), makeSlide("S1")]);
    const state = withStages({ deck: stage("done", originalDeck) });
    const next = reducePipelineResponse(
      "regen-slide",
      200,
      { op: "regen-slide", status: "ok", slides: [makeSlide("X")] },
      state
    );
    expect(next.deck.artifact?.slides).toEqual(originalDeck.slides);
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

describe("mergeRegeneratedSlide", () => {
  const deck = makeDeck("D", [makeSlide("A"), makeSlide("B"), makeSlide("C")]);
  const revised: PptxSlide = { title: "B2", bullets: ["new"] };

  it("replaces only the slide at the index; length and other slides preserved", () => {
    const out = mergeRegeneratedSlide(deck, 1, revised);
    expect(out.slides).toEqual([deck.slides[0], revised, deck.slides[2]]);
    expect(out.slides).toHaveLength(deck.slides.length);
    expect(out.presentationTitle).toBe("D");
    // input not mutated
    expect(deck.slides[1].title).toBe("B");
  });

  it("is a safe no-op for out-of-range or non-integer indexes", () => {
    for (const idx of [-1, 3, 99, 1.5, Number.NaN]) {
      expect(mergeRegeneratedSlide(deck, idx, revised)).toBe(deck);
    }
  });
});

describe("extractRegenCandidate", () => {
  const s0 = makeSlide("S0");
  const s1 = makeSlide("S1");

  it("returns the first slide of an ok regen-slide response", () => {
    expect(extractRegenCandidate(200, { op: "regen-slide", status: "ok", slides: [s0, s1] })).toEqual(s0);
  });

  it("returns null for empty slides, error bodies, non-200, wrong op and malformed bodies", () => {
    expect(extractRegenCandidate(200, { op: "regen-slide", status: "ok", slides: [] })).toBeNull();
    expect(extractRegenCandidate(502, { op: "regen-slide", status: "error", reason: "x" })).toBeNull();
    expect(extractRegenCandidate(502, { op: "regen-slide", status: "ok", slides: [s0] })).toBeNull();
    expect(extractRegenCandidate(200, { op: "deck", status: "ok", slides: [s0] })).toBeNull();
    expect(extractRegenCandidate(200, { op: "regen-slide", status: "ok", slides: [null] })).toBeNull();
    expect(extractRegenCandidate(200, undefined)).toBeNull();
    expect(extractRegenCandidate(200, "nope")).toBeNull();
  });
});

describe("applyRegenDecision", () => {
  const original = makeDeck("D", [makeSlide("A"), makeSlide("B"), makeSlide("C")]);
  const candidate: PptxSlide = { title: "B2", bullets: ["new"] };

  function regenState(): PipelineState {
    return makeCompleteState(original);
  }

  it("accept: replaces only the selected slide, keeps length, stales downstream", () => {
    const next = applyRegenDecision(regenState(), candidate, 1, "accept");
    expect(next.deck.artifact?.slides).toEqual([original.slides[0], candidate, original.slides[2]]);
    expect(next.deck.artifact?.slides).toHaveLength(3);
    expect(next.deck.artifact?.presentationTitle).toBe("D");
    expect(next.deck.status).toBe("done");
    for (const id of ["standard", "reviewInfoFlow", "reviewVisual", "polish"] as StageId[]) {
      expect(next[id].status).toBe("stale");
    }
    // a regen leaves the pipeline incomplete, so no spurious auto-download
    expect(isPipelineComplete(next)).toBe(false);
    expect(shouldAutoDownloadDeck(next, deckFingerprint(original)).download).toBe(false);
  });

  it("accept: an out-of-range index leaves the deck contents unchanged", () => {
    const next = applyRegenDecision(regenState(), candidate, 9, "accept");
    expect(next.deck.artifact?.slides).toEqual(original.slides);
  });

  it("accept: no deck is a no-op", () => {
    const empty = createInitialPipelineState();
    expect(applyRegenDecision(empty, candidate, 0, "accept")).toBe(empty);
  });

  it("discard: returns the state unchanged (deck and every stage status)", () => {
    const state = regenState();
    const next = applyRegenDecision(state, candidate, 1, "discard");
    expect(next).toBe(state);
    expect(next.deck.artifact).toEqual(original);
    expect(next.deck.artifact?.slides).toHaveLength(3);
    expect(next.polish.status).toBe("done");
  });
});

describe("PipelineTab wiring (source-text pin)", () => {
  const src = readFileSync(join(__dirname, "PipelineTab.tsx"), "utf8");

  it("mounts the Regenerate a slide entry button in the deck stage block", () => {
    const deckBlockAt = src.indexOf('activeStage === "deck"');
    const standardBlockAt = src.indexOf('activeStage === "standard"');
    const entryAt = src.indexOf("Regenerate a slide");
    expect(deckBlockAt).toBeGreaterThan(-1);
    expect(entryAt).toBeGreaterThan(deckBlockAt);
    expect(entryAt).toBeLessThan(standardBlockAt);
    expect(src).toMatch(/onClick=\{\(\) => setRegenOpen\(true\)\}/);
  });

  it("conditionally mounts SlideRegenView and no longer auto-merges a regen inline", () => {
    expect(src).toMatch(/regenOpen[\s\S]{0,120}<SlideRegenView/);
    expect(src).not.toContain("handleRegenSlide");
    expect(src).not.toMatch(/reducePipelineResponse\(\s*"regen-slide"/);
  });

  it("persists the open flag via usePersistedJSON", () => {
    expect(src).toContain('"ta-pres-pipeline-regen-open"');
    expect(src).toMatch(/usePersistedJSON<boolean>\(PIPELINE_REGEN_OPEN_KEY/);
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

// ---------------------------------------------------------------------------
// Auto-download at completion (W2)
// ---------------------------------------------------------------------------

function makeCompleteState(deck: DeckContent): PipelineState {
  return withStages({
    sources: stage("done", makeSources()),
    outline: stage("done", makeOutline()),
    activities: stage("done", makeActivities()),
    frame: stage("done", makeFrame()),
    plan: stage("done", makePlan()),
    deck: stage("done", deck),
    reviewInfoFlow: stage<ChecklistResult>("done", null),
    reviewVisual: stage<ChecklistResult>("done", null),
    standard: stage<CheckResult>("done", null),
    polish: stage<PolishResult>("done", null),
  });
}

describe("isPipelineComplete", () => {
  const deck = makeDeck("Deck", [makeSlide("S0")]);

  it("is false for a fresh pipeline", () => {
    expect(isPipelineComplete(createInitialPipelineState())).toBe(false);
  });

  it("is false when the deck is done but later stages are still runnable", () => {
    const state: PipelineState = { ...makeCompleteState(deck), reviewVisual: stage<ChecklistResult>("idle", null) };
    expect(isPipelineComplete(state)).toBe(false);
  });

  it("is false when a later stage errored", () => {
    const state: PipelineState = { ...makeCompleteState(deck), reviewInfoFlow: stage<ChecklistResult>("error", null) };
    expect(isPipelineComplete(state)).toBe(false);
  });

  it("is false when the deck is stale", () => {
    const state: PipelineState = { ...makeCompleteState(deck), deck: stage("stale", deck) };
    expect(isPipelineComplete(state)).toBe(false);
  });

  it("is true when every stage is done", () => {
    expect(isPipelineComplete(makeCompleteState(deck))).toBe(true);
  });
});

describe("shouldAutoDownloadDeck", () => {
  const deck = makeDeck("Deck", [makeSlide("S0")]);

  it("deckFingerprint is equal for equal decks and differs for changed ones", () => {
    expect(deckFingerprint(deck)).toBe(deckFingerprint(makeDeck("Deck", [makeSlide("S0")])));
    expect(deckFingerprint(deck)).not.toBe(deckFingerprint(makeDeck("Deck", [makeSlide("S1")])));
  });

  it("downloads at completion when nothing was downloaded yet", () => {
    const out = shouldAutoDownloadDeck(makeCompleteState(deck), "");
    expect(out).toEqual({ download: true, fingerprint: deckFingerprint(deck) });
  });

  it("does not download again for the same completed deck (reload/revisit)", () => {
    const out = shouldAutoDownloadDeck(makeCompleteState(deck), deckFingerprint(deck));
    expect(out.download).toBe(false);
  });

  it("downloads again for a genuinely new deck", () => {
    const next = makeDeck("Deck", [makeSlide("S0"), makeSlide("S1")]);
    const out = shouldAutoDownloadDeck(makeCompleteState(next), deckFingerprint(deck));
    expect(out.download).toBe(true);
  });

  it("does not download while the pipeline is incomplete", () => {
    const state: PipelineState = { ...makeCompleteState(deck), polish: stage<PolishResult>("idle", null) };
    expect(shouldAutoDownloadDeck(state, "").download).toBe(false);
  });
});

describe("PipelineTab auto-download wiring (source-text pin)", () => {
  const src = readFileSync(join(__dirname, "PipelineTab.tsx"), "utf8");

  it("persists the fingerprint under the ta- key via usePersistedJSON", () => {
    expect(src).toContain('"ta-pres-pipeline-autodl-fingerprint"');
    expect(src).toMatch(/usePersistedJSON<string>\(PIPELINE_AUTODL_FINGERPRINT_KEY/);
  });

  it("manual button and auto path share one download function", () => {
    expect(src.match(/downloadDeckPptx\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src.match(/serializeDeckToPptx\(/g)?.length).toBe(1);
  });
});
