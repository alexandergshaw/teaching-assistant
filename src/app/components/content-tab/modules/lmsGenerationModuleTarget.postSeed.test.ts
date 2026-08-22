import { describe, expect, it } from "vitest";
import { defaultPostModuleChoiceFrom } from "./lmsGenerationModuleTarget";
// The sibling this function's live-key parse must agree with - asserted
// alongside it in case 11 rather than described in prose.
import { liveModuleIdsFromKeys } from "../utils";

// Fixtures shaped like the real SelectedMaterialItem arms
// (src/lib/lms-generation/materials.ts), narrowed to the fields
// defaultPostModuleChoiceFrom's Pick-derived parameter type actually reads.
const live = (moduleId: number) => ({ source: "live" as const, moduleId });
const exportItem = (moduleRef: string) => ({ source: "export" as const, moduleRef });
const repo = (moduleRef: string) => ({ source: "repo" as const, moduleRef });

describe("defaultPostModuleChoiceFrom", () => {
  it("1. single live module via items -> that id", () => {
    expect(defaultPostModuleChoiceFrom([live(5)], [])).toBe("5");
  });

  it("2. single live module via moduleKeys only, no items (AC3) -> that id", () => {
    expect(defaultPostModuleChoiceFrom([], ["live:5"])).toBe("5");
  });

  it("3. items in module 5 PLUS live:5 in moduleKeys -> \"5\" (dedupes, does not count two locations)", () => {
    expect(defaultPostModuleChoiceFrom([live(5)], ["live:5"])).toBe("5");
  });

  it("4. two live modules -> \"\"", () => {
    expect(defaultPostModuleChoiceFrom([live(5), live(6)], [])).toBe("");
  });

  it("5. one live plus one export -> \"\"", () => {
    expect(defaultPostModuleChoiceFrom([live(5), exportItem("m1")], [])).toBe("");
  });

  it("6. export only -> \"\"", () => {
    expect(defaultPostModuleChoiceFrom([exportItem("m1")], [])).toBe("");
  });

  it("7. repo only -> \"\"", () => {
    expect(defaultPostModuleChoiceFrom([repo("assignments/module_05")], [])).toBe("");
  });

  it("8. empty items and empty keys -> \"\"", () => {
    expect(defaultPostModuleChoiceFrom([], [])).toBe("");
  });

  it("9. live module 1 plus export module \"1\" -> \"\" (the collision the tagging prevents)", () => {
    expect(defaultPostModuleChoiceFrom([live(1), exportItem("1")], [])).toBe("");
  });

  it("10. a live: key with a non-numeric ref -> \"\"", () => {
    expect(defaultPostModuleChoiceFrom([], ["live:not-a-number"])).toBe("");
  });

  it("11. a live: key with an EMPTY ref -> \"\", the same as liveModuleIdsFromKeys", () => {
    // The divergence a hand-rolled `slice("live:".length)` parse introduced:
    // `Number("")` is 0 and `Number.isFinite(0)` is true, so a hand-roll
    // returns "0" here - a real-Canvas-module-shaped id nobody selected -
    // while parseModuleKey (utils.ts) rejects an empty ref outright, which is
    // why liveModuleIdsFromKeys(["live:"]) is the EMPTY set. AC2 clause 2
    // requires a NUMERIC ref, and an empty ref is not a number. Unreachable
    // from liveModuleKey(id: number) today; pinned so the two parses cannot
    // drift apart the moment a key ever arrives from somewhere else.
    expect(defaultPostModuleChoiceFrom([], ["live:"])).toBe("");
    expect(liveModuleIdsFromKeys(["live:"]).size).toBe(0);
  });

  it("11b. an untagged key with no colon at all -> \"\"", () => {
    expect(defaultPostModuleChoiceFrom([], ["live"])).toBe("");
  });
});
