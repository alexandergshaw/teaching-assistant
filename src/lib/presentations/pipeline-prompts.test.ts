import { describe, expect, it } from "vitest";
import {
  buildFrameSuggestPrompt,
  buildPipelineActivitiesPrompt,
  buildPipelineDeckPrompt,
  buildPipelineOutlinePrompt,
  buildPlanPrompt,
  buildRegenSlidePrompt,
  buildReviewInfoFlowPrompt,
  buildReviewVisualPrompt,
  parseActivitiesResponse,
  parseDeckResponse,
  parseFrame,
  parseOutlineResponse,
  parsePlan,
  parseRegenSlideResponse,
  parseReviewInfoFlowResponse,
  parseReviewVisualResponse,
} from "./pipeline-prompts";
import type { PipelineRequest } from "./pipeline";
import type { PresentationContext, DeckContent } from "./types";
import type { PinnedFrame } from "@/lib/deck-standard/frame";
import type { SlidePlan } from "@/lib/deck-standard/slide-plan";

// ---------------------------------------------------------------------------
// Fixtures - annotated return types throughout (the type-gate rule: an
// inferred-return fixture helper or an `as <DomainType>` cast switches tsc
// off at exactly the point it would catch a shape drift).
// ---------------------------------------------------------------------------

function makeContext(): PresentationContext {
  return {
    text: "Pasted lecture notes about the request lifecycle.",
    sources: [{ name: "slides-outline.txt", text: "Client sends a request; server routes it." }],
  };
}

function makeFrame(): PinnedFrame {
  return {
    mentalModel: { name: "Request Lifecycle", steps: ["send", "route", "respond"] },
    runningExample: { name: "Weather API", description: "a student-facing weather lookup" },
  };
}

function makePlan(): SlidePlan {
  return {
    entries: [
      { role: "content", dominantClaim: "A request travels from client to server." },
      { role: "prediction", dominantClaim: "Guess what happens on a bad route.", predictionId: "p1" },
      { role: "answer", dominantClaim: "A bad route returns a 404.", predictionId: "p1" },
    ],
  };
}

function makeDeck(): DeckContent {
  return {
    presentationTitle: "Request Lifecycle",
    slides: [
      { title: "Title Slide", bullets: [] },
      { title: "The Request", bullets: ["Client sends", "Server routes"], notes: "Emphasize direction." },
    ],
  };
}

// ---------------------------------------------------------------------------
// outline
// ---------------------------------------------------------------------------

describe("outline", () => {
  it("builds a prompt that includes the material", () => {
    const request: Extract<PipelineRequest, { op: "outline" }> = { op: "outline", context: makeContext() };
    const prompt = buildPipelineOutlinePrompt(request);
    expect(prompt).toContain(makeContext().text);
    expect(prompt).toContain("slides-outline.txt");
  });

  it("parses a non-empty reply into markdown", () => {
    const result = parseOutlineResponse("# Outline\n\n- one\n- two");
    expect(result).toEqual({ markdown: "# Outline\n\n- one\n- two" });
  });

  it("returns null, never throws, on a blank reply", () => {
    expect(() => parseOutlineResponse("   ")).not.toThrow();
    expect(parseOutlineResponse("   ")).toBeNull();
    expect(() => parseOutlineResponse("")).not.toThrow();
    expect(parseOutlineResponse("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// frame-suggest
// ---------------------------------------------------------------------------

describe("frame-suggest", () => {
  it("builds a prompt that includes the material and the JSON shape fields", () => {
    const request: Extract<PipelineRequest, { op: "frame-suggest" }> = {
      op: "frame-suggest",
      context: makeContext(),
    };
    const prompt = buildFrameSuggestPrompt(request);
    expect(prompt).toContain(makeContext().text);
    expect(prompt).toContain("mentalModel");
    expect(prompt).toContain("runningExample");
  });

  it("parses a valid reply into a PinnedFrame", () => {
    const reply = JSON.stringify({
      mentalModel: { name: "Pipeline", steps: ["in", "process", "out"] },
      runningExample: { name: "Thermostat", description: "reads temperature, adjusts heat" },
    });
    const result = parseFrame(reply);
    expect(result).toEqual({
      mentalModel: { name: "Pipeline", steps: ["in", "process", "out"] },
      runningExample: { name: "Thermostat", description: "reads temperature, adjusts heat" },
    });
  });

  it("returns null, never throws, on malformed replies", () => {
    const cases = [
      "not json at all",
      "{}",
      JSON.stringify({ mentalModel: { name: "", steps: [] }, runningExample: { name: "x", description: "y" } }),
      JSON.stringify({ mentalModel: { name: "x", steps: [] }, runningExample: { name: "x", description: "y" } }),
      JSON.stringify({ mentalModel: { name: "x", steps: ["a"] } }),
    ];
    for (const reply of cases) {
      expect(() => parseFrame(reply)).not.toThrow();
      expect(parseFrame(reply)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

describe("plan", () => {
  it("builds a prompt that includes the frame fold lines and the outline, frame before outline", () => {
    const request: Extract<PipelineRequest, { op: "plan" }> = {
      op: "plan",
      context: makeContext(),
      outline: { markdown: "# My Outline" },
      frame: makeFrame(),
    };
    const prompt = buildPlanPrompt(request);
    expect(prompt).toContain("Request Lifecycle");
    expect(prompt).toContain("Weather API");
    expect(prompt).toContain("# My Outline");
    expect(prompt.indexOf("Request Lifecycle")).toBeLessThan(prompt.indexOf("# My Outline"));
  });

  it("omits the frame fold lines entirely when frame is null", () => {
    const request: Extract<PipelineRequest, { op: "plan" }> = {
      op: "plan",
      context: makeContext(),
      outline: { markdown: "# My Outline" },
      frame: null,
    };
    const prompt = buildPlanPrompt(request);
    expect(prompt).not.toContain("Reused mental model");
    expect(prompt).not.toContain("Running example");
  });

  it("parses a valid reply into a SlidePlan with content/prediction/answer entries", () => {
    const reply = JSON.stringify({
      entries: [
        { role: "content", dominantClaim: "claim one" },
        { role: "prediction", dominantClaim: "guess", predictionId: "p1" },
        { role: "answer", dominantClaim: "reveal", predictionId: "p1" },
      ],
    });
    const result = parsePlan(reply);
    expect(result).toEqual({
      entries: [
        { role: "content", dominantClaim: "claim one" },
        { role: "prediction", dominantClaim: "guess", predictionId: "p1" },
        { role: "answer", dominantClaim: "reveal", predictionId: "p1" },
      ],
    });
  });

  it("returns null, never throws, on malformed replies", () => {
    const cases = [
      "not json",
      JSON.stringify({}),
      JSON.stringify({ entries: [] }),
      JSON.stringify({ entries: [{ role: "content", dominantClaim: "" }] }),
      JSON.stringify({ entries: [{ role: "prediction", dominantClaim: "x" }] }),
      JSON.stringify({ entries: [{ role: "bogus", dominantClaim: "x" }] }),
    ];
    for (const reply of cases) {
      expect(() => parsePlan(reply)).not.toThrow();
      expect(parsePlan(reply)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// deck
// ---------------------------------------------------------------------------

describe("deck", () => {
  it("folds the structure contract, the frame fold lines, and the deck shape, and the plan's dominant claims", () => {
    const request: Extract<PipelineRequest, { op: "deck" }> = {
      op: "deck",
      context: makeContext(),
      frame: makeFrame(),
      plan: makePlan(),
    };
    const prompt = buildPipelineDeckPrompt(request);

    // structure contract
    expect(prompt).toContain("Each slide must have a");
    // frame fold lines
    expect(prompt).toContain("Request Lifecycle");
    expect(prompt).toContain("Weather API");
    // deck JSON shape
    expect(prompt).toContain("presentationTitle");
    expect(prompt).toContain("bullets");
    // plan dominant claims
    expect(prompt).toContain("A request travels from client to server.");
    expect(prompt).toContain("Guess what happens on a bad route.");
    expect(prompt).toContain("A bad route returns a 404.");
    // material
    expect(prompt).toContain(makeContext().text);

    // ordering: structure contract before frame, frame before plan claims, plan claims before material
    const structureIdx = prompt.indexOf("Each slide must have a");
    const frameIdx = prompt.indexOf("Request Lifecycle");
    const claimIdx = prompt.indexOf("A request travels from client to server.");
    const materialIdx = prompt.indexOf(makeContext().text);
    expect(structureIdx).toBeLessThan(frameIdx);
    expect(frameIdx).toBeLessThan(claimIdx);
    expect(claimIdx).toBeLessThan(materialIdx);
  });

  it("omits frame fold lines when frame is null but still folds the structure contract and plan", () => {
    const request: Extract<PipelineRequest, { op: "deck" }> = {
      op: "deck",
      context: makeContext(),
      frame: null,
      plan: makePlan(),
    };
    const prompt = buildPipelineDeckPrompt(request);
    expect(prompt).not.toContain("Reused mental model");
    expect(prompt).toContain("Each slide must have a");
    expect(prompt).toContain("A request travels from client to server.");
  });

  it("parses a valid deck reply", () => {
    const reply = JSON.stringify({
      presentationTitle: "My Deck",
      slides: [{ title: "Intro", bullets: ["a", "b"] }],
    });
    const result = parseDeckResponse(reply);
    expect(result).not.toBeNull();
    expect(result?.presentationTitle).toBe("My Deck");
    expect(result?.slides).toHaveLength(1);
  });

  it("rejects (returns null, never throws) the same invalid shapes parseDeckSlides rejects", () => {
    const cases = [
      "not json",
      JSON.stringify({ presentationTitle: "x", slides: [] }),
      JSON.stringify({ presentationTitle: "x", slides: [{ title: "", bullets: [] }] }),
      JSON.stringify({ presentationTitle: "x", slides: [{ title: "ok", bullets: "not-an-array" }] }),
    ];
    for (const reply of cases) {
      expect(() => parseDeckResponse(reply)).not.toThrow();
      expect(parseDeckResponse(reply)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// activities
// ---------------------------------------------------------------------------

describe("activities", () => {
  it("builds a prompt that includes the material", () => {
    const request: Extract<PipelineRequest, { op: "activities" }> = { op: "activities", context: makeContext() };
    const prompt = buildPipelineActivitiesPrompt(request);
    expect(prompt).toContain(makeContext().text);
  });

  it("parses a valid JSON array reply into ideas", () => {
    const result = parseActivitiesResponse(JSON.stringify(["Build a mock server", "Trace a request by hand"]));
    expect(result).toEqual({ ideas: ["Build a mock server", "Trace a request by hand"] });
  });

  it("never throws and returns an empty ideas list on a malformed reply", () => {
    expect(() => parseActivitiesResponse("not json")).not.toThrow();
    expect(parseActivitiesResponse("not json")).toEqual({ ideas: [] });
  });
});

// ---------------------------------------------------------------------------
// review-infoflow / review-visual
// ---------------------------------------------------------------------------

describe("review-infoflow", () => {
  it("builds a prompt containing every info-flow checklist item", () => {
    const request: Extract<PipelineRequest, { op: "review-infoflow" }> = {
      op: "review-infoflow",
      deck: makeDeck(),
    };
    const prompt = buildReviewInfoFlowPrompt(request);
    expect(prompt).toContain("Is the main point obvious?");
    expect(prompt).toContain("Does the student know where to look first?");
    expect(prompt).toContain("Is technical detail introduced too early?");
    expect(prompt).toContain("Does a diagram imply something incorrect?");
  });

  it("parses a valid reply into findings, never throws on malformed input", () => {
    const reply = JSON.stringify([{ itemId: "main-point-obvious", slideIndex: 1, message: "unclear focus" }]);
    const result = parseReviewInfoFlowResponse(reply);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].itemId).toBe("main-point-obvious");

    expect(() => parseReviewInfoFlowResponse("not json")).not.toThrow();
    expect(parseReviewInfoFlowResponse("not json").findings).toEqual([]);
  });
});

describe("review-visual", () => {
  it("builds a prompt containing every visual checklist item", () => {
    const request: Extract<PipelineRequest, { op: "review-visual" }> = { op: "review-visual", deck: makeDeck() };
    const prompt = buildReviewVisualPrompt(request);
    expect(prompt).toContain("Is every arrow drawn in the direction");
    expect(prompt).toContain("shown as a single message where it should be shown as two");
    expect(prompt).toContain("make HTML appear to make requests on its own");
    expect(prompt).toContain("conflate a URL query string with a URL fragment");
  });

  it("parses a valid reply into findings, never throws on malformed input", () => {
    const reply = JSON.stringify([{ itemId: "arrow-direction", slideIndex: 0, message: "backwards arrow" }]);
    const result = parseReviewVisualResponse(reply);
    expect(result.findings).toHaveLength(1);

    expect(() => parseReviewVisualResponse("{{{not json")).not.toThrow();
    expect(parseReviewVisualResponse("{{{not json").findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// regen-slide
// ---------------------------------------------------------------------------

describe("regen-slide", () => {
  it("derives priorSlide/planEntry by index and folds the frame + instruction", () => {
    const request: Extract<PipelineRequest, { op: "regen-slide" }> = {
      op: "regen-slide",
      context: makeContext(),
      frame: makeFrame(),
      plan: makePlan(),
      deck: makeDeck(),
      slideIndex: 1,
      instruction: "Make it punchier.",
    };
    const prompt = buildRegenSlidePrompt(request);

    expect(prompt).toContain("The Request"); // priorSlide title, deck.slides[1]
    expect(prompt).toContain("Client sends");
    expect(prompt).toContain("Guess what happens on a bad route."); // plan.entries[1].dominantClaim
    expect(prompt).toContain("Request Lifecycle"); // frame fold line
    expect(prompt).toContain("Make it punchier."); // instruction
    expect(prompt).toContain(makeContext().text); // material
    expect(prompt).toContain('"slides"');

    const priorIdx = prompt.indexOf("The Request");
    const instructionIdx = prompt.indexOf("Make it punchier.");
    expect(priorIdx).toBeLessThan(instructionIdx);
  });

  it("handles an out-of-range slideIndex without throwing", () => {
    const request: Extract<PipelineRequest, { op: "regen-slide" }> = {
      op: "regen-slide",
      context: makeContext(),
      frame: null,
      plan: makePlan(),
      deck: makeDeck(),
      slideIndex: 99,
      instruction: "Fix it.",
    };
    expect(() => buildRegenSlidePrompt(request)).not.toThrow();
    expect(buildRegenSlidePrompt(request)).toContain("(no prior slide at this index)");
  });

  it("parses a valid one-slide reply into a one-element PptxSlide[]", () => {
    const reply = JSON.stringify({
      presentationTitle: "ignored",
      slides: [{ title: "New Title", bullets: ["fresh point"] }],
    });
    const result = parseRegenSlideResponse(reply);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("New Title");
  });

  it("never throws and returns [] on a malformed or invalid reply", () => {
    const cases = [
      "not json",
      JSON.stringify({ presentationTitle: "x", slides: [] }),
      JSON.stringify({ presentationTitle: "x", slides: [{ title: "", bullets: [] }] }),
    ];
    for (const reply of cases) {
      expect(() => parseRegenSlideResponse(reply)).not.toThrow();
      expect(parseRegenSlideResponse(reply)).toEqual([]);
    }
  });
});
