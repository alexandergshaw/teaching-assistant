import { describe, it, expect } from "vitest";
import { needsOnNavyFocusRing } from "./focus-ring-fill";

describe("needsOnNavyFocusRing", () => {
  it("flags the app's own navy (the classic deck fill) as needing the on-navy ring", () => {
    expect(needsOnNavyFocusRing(["#1a2744"])).toBe(true);
  });

  it("does not flag white", () => {
    expect(needsOnNavyFocusRing(["#ffffff"])).toBe(false);
  });

  it("does not flag a light pastel solid fill", () => {
    expect(needsOnNavyFocusRing(["#f4f7fb"])).toBe(false);
  });

  it("flags a near-black solid fill", () => {
    expect(needsOnNavyFocusRing(["#0b1120"])).toBe(true);
  });

  it("a gradient with one dark stop and one light stop is flagged (worst case wins)", () => {
    expect(needsOnNavyFocusRing(["#ffffff", "#0b1120"])).toBe(true);
    expect(needsOnNavyFocusRing(["#0b1120", "#ffffff"])).toBe(true);
  });

  it("a gradient with two light stops is not flagged", () => {
    expect(needsOnNavyFocusRing(["#ffffff", "#f4f7fb"])).toBe(false);
  });

  it("supports 3-digit hex shorthand", () => {
    expect(needsOnNavyFocusRing(["#000"])).toBe(true);
    expect(needsOnNavyFocusRing(["#fff"])).toBe(false);
  });

  it("treats unparseable input (a CSS gradient string, a var()) as not-dark rather than throwing", () => {
    expect(needsOnNavyFocusRing(["linear-gradient(135deg, #000, #fff)"])).toBe(false);
    expect(needsOnNavyFocusRing(["var(--accent)"])).toBe(false);
    expect(needsOnNavyFocusRing([""])).toBe(false);
  });

  it("an empty list is not flagged", () => {
    expect(needsOnNavyFocusRing([])).toBe(false);
  });

  it("classifies unambiguous mid-tones on the correct side of the black/white split", () => {
    // #333333: black contrasts far better against it than white does - dark.
    expect(needsOnNavyFocusRing(["#333333"])).toBe(true);
    // #cccccc: white contrasts far better against it than black does - light.
    expect(needsOnNavyFocusRing(["#cccccc"])).toBe(false);
  });
});
