import { describe, it, expect } from "vitest";
import { summarize } from "./scaffold";

describe("summarize", () => {
  it("returns the input unchanged when it has few sentences", () => {
    expect(summarize("Only one sentence here.", 2)).toBe("Only one sentence here.");
  });

  it("selects the most topical sentences and keeps original order", () => {
    const text =
      "Photosynthesis converts sunlight into chemical energy. The cafeteria serves lunch at noon. " +
      "Chlorophyll in the leaves absorbs sunlight for photosynthesis. Buses leave from the north lot.";
    const summary = summarize(text, 2);
    // The two photosynthesis sentences are the most topical.
    expect(summary).toContain("Photosynthesis converts sunlight");
    expect(summary).toContain("Chlorophyll in the leaves");
    expect(summary).not.toContain("cafeteria");
    // Original order preserved.
    expect(summary.indexOf("Photosynthesis")).toBeLessThan(summary.indexOf("Chlorophyll"));
  });

  it("is deterministic", () => {
    const text = "Alpha beta gamma delta. Beta gamma delta epsilon. Unrelated filler sentence here.";
    expect(summarize(text, 1)).toBe(summarize(text, 1));
  });

  it("returns an empty string for empty input", () => {
    expect(summarize("", 2)).toBe("");
  });
});
