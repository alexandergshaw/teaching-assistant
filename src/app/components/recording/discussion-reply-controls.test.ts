import { describe, expect, it } from "vitest";
import {
  formalityAriaValueText,
  formalityIndexFromStop,
  formalityStopFromIndex,
  ingredientsRenderValue,
} from "./discussion-reply-controls";

// docs/reply-composition-controls-acceptance-criteria.md C2c-i/C4c: frozen
// literal oracles, not values re-derived from the implementation - the
// point is to pin the exact string a person reads, so a change to either
// the wording or the mapping fails loudly here rather than only being
// caught by someone reading the rendered control.

describe("ingredientsRenderValue", () => {
  it("reads as a real phrase, not a blank box, when nothing is selected (C2c-i)", () => {
    expect(ingredientsRenderValue([])).toBe("Nothing in particular");
  });

  it("prints the label, never the raw enum id, for a single selection", () => {
    expect(ingredientsRenderValue(["compliment"])).toBe("a compliment on what the post did well");
  });

  it("joins multiple labels with a comma-space, in the given order", () => {
    expect(ingredientsRenderValue(["compliment", "deeper-question"])).toBe(
      "a compliment on what the post did well, a question that goes deeper"
    );
  });

  it("covers every ingredient's label at least once", () => {
    expect(
      ingredientsRenderValue(["compliment", "deeper-question", "insight", "resources", "correction"])
    ).toBe(
      "a compliment on what the post did well, a question that goes deeper, an insight not already covered, two or three relevant resources, a gentle correction, only if something is wrong"
    );
  });
});

describe("formalityIndexFromStop / formalityStopFromIndex", () => {
  it("round-trips all three stops through their fixed indices", () => {
    expect(formalityIndexFromStop("casual")).toBe(0);
    expect(formalityIndexFromStop("balanced")).toBe(1);
    expect(formalityIndexFromStop("formal")).toBe(2);
    expect(formalityStopFromIndex(0)).toBe("casual");
    expect(formalityStopFromIndex(1)).toBe("balanced");
    expect(formalityStopFromIndex(2)).toBe("formal");
  });

  it("falls back to balanced for an index this repo never produces", () => {
    expect(formalityStopFromIndex(5)).toBe("balanced");
    expect(formalityStopFromIndex(-1)).toBe("balanced");
  });
});

describe("formalityAriaValueText", () => {
  it("speaks the stop's visible name, not a bare number (C4c)", () => {
    expect(formalityAriaValueText(0)).toBe("Casual");
    expect(formalityAriaValueText(1)).toBe("Balanced");
    expect(formalityAriaValueText(2)).toBe("Formal");
  });

  it("degrades to the balanced stop's name for an out-of-range index", () => {
    expect(formalityAriaValueText(9)).toBe("Balanced");
  });
});
