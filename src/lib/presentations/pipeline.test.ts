import { describe, expect, it } from "vitest";
import {
  ALL_STAGE_IDS,
  applyStageEdit,
  canRunStage,
  computeStale,
  createInitialPipelineState,
  type PipelineRequest,
  type PipelineResponse,
  type PipelineState,
  type StageId,
} from "./pipeline";
import type { PinnedFrame } from "@/lib/deck-standard/frame";
import type { SlidePlan } from "@/lib/deck-standard/slide-plan";
import type { GeneratedDeck } from "@/lib/decks/generate";

// ---------------------------------------------------------------------------
// Fixtures - annotated return types throughout, per the type-gate rule
// (a fixture built through `as <DomainType>` or an inferred-return helper
// switches tsc off at exactly the point it would catch a shape drift).
// ---------------------------------------------------------------------------

function makeDeck(): GeneratedDeck {
  return {
    presentationTitle: "Test Deck",
    slides: [
      { title: "Title Slide", bullets: [] },
      { title: "Body Slide", bullets: ["one", "two"] },
    ],
  };
}

function makeFrame(): PinnedFrame {
  return {
    mentalModel: { name: "Request Lifecycle", steps: ["send", "route", "respond"] },
    runningExample: { name: "Weather API", description: "a student-facing weather lookup" },
  };
}

function makePlan(): SlidePlan {
  return { entries: [{ role: "content", dominantClaim: "The client sends one request." }] };
}

/**
 * A state with every stage "done" and carrying a fixture artifact, so
 * canRunStage/computeStale tests exercise a fully-populated pipeline rather
 * than the all-idle initial state.
 */
function makeDoneState(): PipelineState {
  return {
    sources: { artifact: [{ name: "notes.txt", text: "source text" }], status: "done" },
    outline: { artifact: { markdown: "# Outline" }, status: "done" },
    activities: { artifact: { ideas: ["Build a client", "Trace a request"] }, status: "done" },
    frame: { artifact: makeFrame(), status: "done" },
    plan: { artifact: makePlan(), status: "done" },
    deck: { artifact: makeDeck(), status: "done" },
    standard: { artifact: { standardVersion: "deck-standard-v1", violations: [] }, status: "done" },
    reviewInfoFlow: { artifact: { checklistVersion: "info-flow-checklist-v1", findings: [], ranItemIds: [] }, status: "done" },
    reviewVisual: { artifact: { checklistVersion: "visual-checklist-v1", findings: [], ranItemIds: [] }, status: "done" },
    polish: { artifact: { deck: makeDeck(), changes: [] }, status: "done" },
  } satisfies PipelineState;
}

// The oracle table: independently authored from the plan's OWN prose
// (docs/pres-2-s6-plan.md section 3, "editing frame marks deck, reviews,
// polish stale ... editing outline marks plan, deck, reviews, polish ...
// editing plan marks deck, reviews, polish ... editing deck marks reviews,
// polish [and recomputes standard]"), not derived from computeStale's
// implementation - a source other than the generator, per the gate.
//
// `activities` (S6.3 amendment): its op payload is `{context}`, the same
// shape as `outline`'s, and `context` embeds `sources` - so it depends on
// `sources` exactly as `outline` does, and `sources`'s downstream set below
// includes it. Nothing consumes `activities` (the `deck` op payload is
// `{context, frame, plan}`, no `activities` field), so its OWN downstream
// set is empty, and it is absent from every other stage's set.
const STALE_ORACLE: Record<StageId, StageId[]> = {
  sources: ["outline", "activities", "frame", "plan", "deck", "standard", "reviewInfoFlow", "reviewVisual", "polish"],
  outline: ["plan", "deck", "standard", "reviewInfoFlow", "reviewVisual", "polish"],
  activities: [],
  frame: ["deck", "standard", "reviewInfoFlow", "reviewVisual", "polish"],
  plan: ["deck", "standard", "reviewInfoFlow", "reviewVisual", "polish"],
  deck: ["standard", "reviewInfoFlow", "reviewVisual", "polish"],
  standard: [],
  reviewInfoFlow: [],
  reviewVisual: [],
  polish: [],
};

describe("computeStale (the invalidation graph)", () => {
  const state = makeDoneState();

  for (const editedStage of ALL_STAGE_IDS) {
    it(`editing "${editedStage}" marks exactly its oracle's downstream set stale`, () => {
      const stale = new Set(computeStale(state, editedStage));
      const expected = STALE_ORACLE[editedStage];

      for (const expectedStage of expected) {
        expect(stale.has(expectedStage)).toBe(true);
      }
      expect(stale.size).toBe(expected.length);
      // The edited stage never stales itself.
      expect(stale.has(editedStage)).toBe(false);
    });
  }

  it("non-vacuous: editing frame actually returns a non-empty stale set", () => {
    expect(computeStale(state, "frame").length).toBeGreaterThan(0);
  });

  it("PROBE - editing frame does NOT stale the independent 'outline' or 'sources' stages", () => {
    const stale = new Set(computeStale(state, "frame"));
    expect(stale.has("outline")).toBe(false);
    expect(stale.has("sources")).toBe(false);
    // plan is the plan's own explicitly-stated non-dependent ("deck folds
    // the frame; plan does not").
    expect(stale.has("plan")).toBe(false);
  });

  it("PROBE - editing plan does NOT stale 'outline' or 'frame' (its siblings, not its dependents)", () => {
    const stale = new Set(computeStale(state, "plan"));
    expect(stale.has("outline")).toBe(false);
    expect(stale.has("frame")).toBe(false);
    expect(stale.has("sources")).toBe(false);
  });

  it("PROBE - editing sources DOES stale 'activities' (activities depends on sources, same as outline)", () => {
    const stale = new Set(computeStale(state, "sources"));
    expect(stale.has("activities")).toBe(true);
  });

  it("PROBE - editing outline/frame/plan/deck does NOT stale 'activities' (nothing derives activities from them)", () => {
    expect(new Set(computeStale(state, "outline")).has("activities")).toBe(false);
    expect(new Set(computeStale(state, "frame")).has("activities")).toBe(false);
    expect(new Set(computeStale(state, "plan")).has("activities")).toBe(false);
    expect(new Set(computeStale(state, "deck")).has("activities")).toBe(false);
  });

  it("editing 'activities' itself stales nothing downstream (deck does not consume it)", () => {
    expect(computeStale(state, "activities")).toEqual([]);
  });

  it("editing the leaf stages (activities/standard/reviews/polish) stales nothing downstream", () => {
    expect(computeStale(state, "activities")).toEqual([]);
    expect(computeStale(state, "standard")).toEqual([]);
    expect(computeStale(state, "reviewInfoFlow")).toEqual([]);
    expect(computeStale(state, "reviewVisual")).toEqual([]);
    expect(computeStale(state, "polish")).toEqual([]);
  });

  it("sabotage probe: dropping the frame->deck edge would break this test (documents the oracle is load-bearing)", () => {
    // This test does not mutate pipeline.ts; it records the expectation the
    // gate report cites as the "revert one edge -> red" sabotage: removing
    // "frame" from deck's dependency list would make this assertion false.
    const stale = new Set(computeStale(state, "frame"));
    expect(stale.has("deck")).toBe(true);
  });
});

describe("stage-state transitions", () => {
  it("createInitialPipelineState starts every stage idle with no artifact", () => {
    const state = createInitialPipelineState();
    for (const stageId of ALL_STAGE_IDS) {
      expect(state[stageId].status).toBe("idle");
      expect(state[stageId].artifact).toBeNull();
    }
  });

  it("applyStageEdit marks the edited stage done and its dependents stale, without mutating the input", () => {
    const before = makeDoneState();
    const newFrame = makeFrame();
    const after = applyStageEdit(before, "frame", newFrame);

    expect(after.frame.status).toBe("done");
    expect(after.frame.artifact).toBe(newFrame);
    expect(after.deck.status).toBe("stale");
    expect(after.reviewInfoFlow.status).toBe("stale");
    expect(after.reviewVisual.status).toBe("stale");
    expect(after.polish.status).toBe("stale");
    // plan and outline are independent of a frame edit.
    expect(after.plan.status).toBe("done");
    expect(after.outline.status).toBe("done");
    // Stale stages KEEP their last-good artifact (the "honored downstream"
    // model - only the status changes, the value is not discarded).
    expect(after.deck.artifact).toEqual(before.deck.artifact);

    // Immutability: the input state is untouched.
    expect(before.frame.status).toBe("done");
    expect(before.deck.status).toBe("done");
  });

  it("applyStageEdit on plan does not disturb frame or outline", () => {
    const before = makeDoneState();
    const after = applyStageEdit(before, "plan", makePlan());
    expect(after.frame.status).toBe("done");
    expect(after.outline.status).toBe("done");
    expect(after.deck.status).toBe("stale");
  });

  it("applyStageEdit on sources stales activities (along with outline/frame and the rest)", () => {
    const before = makeDoneState();
    const after = applyStageEdit(before, "sources", [{ name: "new.txt", text: "new source text" }]);
    expect(after.activities.status).toBe("stale");
    expect(after.outline.status).toBe("stale");
  });

  it("applyStageEdit on activities marks it done and disturbs nothing else", () => {
    const before = makeDoneState();
    const newActivities = { ideas: ["Trace a packet"] };
    const after = applyStageEdit(before, "activities", newActivities);

    expect(after.activities.status).toBe("done");
    expect(after.activities.artifact).toBe(newActivities);
    // Nothing consumes activities, so nothing else is staled.
    expect(after.deck.status).toBe("done");
    expect(after.standard.status).toBe("done");
    expect(after.reviewInfoFlow.status).toBe("done");
    expect(after.reviewVisual.status).toBe("done");
    expect(after.polish.status).toBe("done");
    expect(after.outline.status).toBe("done");
    expect(after.frame.status).toBe("done");
    expect(after.plan.status).toBe("done");
  });

  describe("canRunStage", () => {
    it("sources can always run (no dependencies)", () => {
      const state = createInitialPipelineState();
      expect(canRunStage(state, "sources")).toBe(true);
    });

    it("a stage with an idle/no-artifact dependency cannot run", () => {
      const state = createInitialPipelineState();
      expect(canRunStage(state, "outline")).toBe(false);
      expect(canRunStage(state, "activities")).toBe(false);
      expect(canRunStage(state, "deck")).toBe(false);
    });

    it("a stage whose dependencies are all done can run", () => {
      const state = makeDoneState();
      expect(canRunStage(state, "activities")).toBe(true);
      expect(canRunStage(state, "deck")).toBe(true);
      expect(canRunStage(state, "standard")).toBe(true);
    });

    it("a stage with a STALE dependency cannot run (must re-run the stale upstream first)", () => {
      const done = makeDoneState();
      const staled: PipelineState = { ...done, frame: { ...done.frame, status: "stale" } };
      expect(canRunStage(staled, "deck")).toBe(false);
    });

    it("a stage whose own status is stale (but whose dependencies are all done) CAN run - that is what re-running it means", () => {
      const done = makeDoneState();
      const after = applyStageEdit(done, "plan", makePlan());
      expect(after.deck.status).toBe("stale");
      expect(canRunStage(after, "deck")).toBe(true);
    });
  });
});

describe("the wire contract: request/response types constructed per op", () => {
  const context = { text: "raw pasted notes", sources: [] };
  const frame = makeFrame();
  const plan = makePlan();
  const deck = makeDeck();

  it("outline", () => {
    const request: PipelineRequest = { op: "outline", context };
    const response: PipelineResponse = { op: "outline", status: "ok", outline: { markdown: "# Outline" } };
    expect(request.op).toBe("outline");
    expect(response.status).toBe("ok");
  });

  it("frame-suggest", () => {
    const request: PipelineRequest = { op: "frame-suggest", context };
    const response: PipelineResponse = { op: "frame-suggest", status: "ok", frame };
    expect(request.op).toBe("frame-suggest");
    if (response.status === "ok" && response.op === "frame-suggest") {
      expect(response.frame.mentalModel.name).toBe("Request Lifecycle");
    } else {
      throw new Error("expected an ok frame-suggest response");
    }
  });

  it("plan", () => {
    const request: PipelineRequest = { op: "plan", context, outline: { markdown: "# Outline" }, frame };
    const response: PipelineResponse = { op: "plan", status: "ok", plan };
    expect(request.op).toBe("plan");
    expect(response.status).toBe("ok");
  });

  it("deck", () => {
    const request: PipelineRequest = { op: "deck", context, frame, plan };
    const response: PipelineResponse = { op: "deck", status: "ok", deck };
    expect(request.op).toBe("deck");
    if (response.status === "ok" && response.op === "deck") {
      expect(response.deck.slides.length).toBe(2);
    } else {
      throw new Error("expected an ok deck response");
    }
  });

  it("activities", () => {
    const request: PipelineRequest = { op: "activities", context };
    const response: PipelineResponse = { op: "activities", status: "ok", activities: { ideas: ["Build a client", "Trace a request"] } };
    expect(request.op).toBe("activities");
    expect(response.status).toBe("ok");
  });

  it("review-infoflow", () => {
    const request: PipelineRequest = { op: "review-infoflow", deck };
    const response: PipelineResponse = {
      op: "review-infoflow",
      status: "ok",
      result: { checklistVersion: "info-flow-checklist-v1", findings: [], ranItemIds: ["vocab-without-a-model"] },
    };
    expect(request.op).toBe("review-infoflow");
    expect(response.status).toBe("ok");
  });

  it("review-visual", () => {
    const request: PipelineRequest = { op: "review-visual", deck };
    const response: PipelineResponse = {
      op: "review-visual",
      status: "ok",
      result: { checklistVersion: "visual-checklist-v1", findings: [], ranItemIds: [] },
    };
    expect(request.op).toBe("review-visual");
    expect(response.status).toBe("ok");
  });

  it("regen-slide - carries deck + slideIndex + instruction (brief) alongside context/frame/plan (plan doc)", () => {
    const request: PipelineRequest = {
      op: "regen-slide",
      context,
      frame,
      plan,
      deck,
      slideIndex: 1,
      instruction: "Make this slide mention the running example by name.",
    };
    const response: PipelineResponse = { op: "regen-slide", status: "ok", slides: deck.slides };
    expect(request.op).toBe("regen-slide");
    expect(request.slideIndex).toBe(1);
    if (response.status === "ok" && response.op === "regen-slide") {
      expect(Array.isArray(response.slides)).toBe(true);
    } else {
      throw new Error("expected an ok regen-slide response");
    }
  });

  it("an error response carries no op-specific artifact, just a reason", () => {
    const response: PipelineResponse = { status: "error", reason: "upstream model call failed" };
    expect(response.status).toBe("error");
    if (response.status === "error") {
      expect(typeof response.reason).toBe("string");
    }
  });
});
