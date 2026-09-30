import { describe, expect, it } from "vitest";
import {
  buildFrameFoldLines,
  frameConsistencyReceipt,
  type PinnedFrame,
  type FrameDeckInput,
} from "./frame";

const FRAME: PinnedFrame = {
  mentalModel: { name: "Web request", steps: ["Find", "Connect", "Request", "Build"] },
  runningExample: { name: "weather API", description: "a lookup for today's forecast" },
};

describe("buildFrameFoldLines", () => {
  it("emits both lines when both fields are present", () => {
    const lines = buildFrameFoldLines(FRAME);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Find -> Connect -> Request -> Build");
    expect(lines[1]).toContain("weather API");
  });

  it("omits the mental-model line when its steps are empty, keeping the other line separately deletable", () => {
    const frame: PinnedFrame = {
      mentalModel: { name: "Web request", steps: [] },
      runningExample: { name: "weather API", description: "a lookup" },
    };
    const lines = buildFrameFoldLines(frame);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("weather API");
    expect(lines.join("\n")).not.toContain("Web request");
  });

  it("omits the running-example line when its name is empty, keeping the mental-model line", () => {
    const frame: PinnedFrame = {
      mentalModel: { name: "Web request", steps: ["Find", "Connect"] },
      runningExample: { name: "", description: "" },
    };
    const lines = buildFrameFoldLines(frame);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Find -> Connect");
  });

  it("returns no lines for a missing frame", () => {
    expect(buildFrameFoldLines(undefined)).toEqual([]);
    expect(buildFrameFoldLines(null)).toEqual([]);
  });

  // FRAME-FOLD sabotage: deleting the fold line for a field must turn a
  // caller's captured prompt RED (no longer contain the step names). This
  // proves the fold function itself is the thing making the guarantee true,
  // by simulating the "line deleted" state directly.
  it("sabotage: a caller who fails to include buildFrameFoldLines' output loses the frame from its composed prompt", () => {
    const lines = buildFrameFoldLines(FRAME);
    const promptWithFold = ["Generate a slide.", "", ...lines].join("\n");
    const promptWithoutFold = ["Generate a slide."].join("\n");

    expect(promptWithFold).toContain("Find");
    expect(promptWithFold).toContain("weather API");
    expect(promptWithoutFold).not.toContain("Find");
    expect(promptWithoutFold).not.toContain("weather API");
  });
});

describe("frameConsistencyReceipt", () => {
  it("reports high mentions for slides that engage both the mental model and the running example", () => {
    const deck: FrameDeckInput = {
      slides: [
        {
          title: "Find the weather API",
          bullets: ["Connect to the endpoint", "Request the forecast"],
        },
      ],
    };
    const receipt = frameConsistencyReceipt(deck, FRAME);
    expect(receipt).toEqual([{ slideIndex: 0, mentions: 4 }]);
  });

  it("flags, with correct indices, slides that engage neither the model nor the example (drift)", () => {
    const deck: FrameDeckInput = {
      slides: [
        { title: "Introduction", bullets: [] }, // engages neither
        { title: "Find the weather API", bullets: [] }, // on-frame (mentions Find + weather API)
        { title: "Unrelated aside", bullets: ["Nothing to do with any of this"] }, // engages neither
      ],
    };
    const receipt = frameConsistencyReceipt(deck, FRAME);
    expect(receipt).toEqual([
      { slideIndex: 0, mentions: 0 },
      { slideIndex: 1, mentions: 2 },
      { slideIndex: 2, mentions: 0 },
    ]);

    const driftSlideIndices = receipt.filter((r) => r.mentions === 0).map((r) => r.slideIndex);
    expect(driftSlideIndices).toEqual([0, 2]);
  });

  it("counts a mention found in slide notes, not only title/bullets", () => {
    const deck: FrameDeckInput = {
      slides: [{ title: "Recap", bullets: [], notes: "Tie back to the weather API example." }],
    };
    const receipt = frameConsistencyReceipt(deck, FRAME);
    expect(receipt).toEqual([{ slideIndex: 0, mentions: 1 }]);
  });

  it("is case-insensitive", () => {
    const deck: FrameDeckInput = {
      slides: [{ title: "FIND the WEATHER API", bullets: [] }],
    };
    const receipt = frameConsistencyReceipt(deck, FRAME);
    expect(receipt[0].mentions).toBe(2);
  });

  // Non-vacuous sabotage: a receipt that ignored the frame entirely (always
  // returning 0 mentions) would MISS the drift distinction this test relies
  // on - it would report the on-frame slide the same as the off-frame ones.
  // This proves the assertions above are not trivially satisfied.
  it("sabotage: a receipt that ignores the frame would fail to distinguish on-frame from off-frame slides", () => {
    const deck: FrameDeckInput = {
      slides: [
        { title: "Find the weather API", bullets: ["Connect to it"] },
        { title: "Unrelated aside", bullets: [] },
      ],
    };
    const receipt = frameConsistencyReceipt(deck, FRAME);
    const brokenReceiptThatIgnoresFrame = deck.slides.map((_, slideIndex) => ({
      slideIndex,
      mentions: 0,
    }));
    expect(receipt).not.toEqual(brokenReceiptThatIgnoresFrame);
    expect(receipt[0].mentions).toBeGreaterThan(0);
    expect(receipt[1].mentions).toBe(0);
  });
});
