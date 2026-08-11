import { describe, expect, it } from "vitest";
import type { CartridgeCourseData, CartridgeModule } from "@/lib/cartridge-import";
import { adaptCartridgeToCourseContent } from "./adapter";

function baseData(overrides: Partial<CartridgeCourseData> = {}): CartridgeCourseData {
  return {
    title: "INFO 1020",
    courseCode: null,
    startAt: null,
    syllabusHtml: null,
    modules: [],
    rubrics: [],
    hasCourseSettings: true,
    ...overrides,
  };
}

describe("adaptCartridgeToCourseContent", () => {
  it("uses the cartridge title as courseName when present", () => {
    const data = baseData({ title: "INFO 1020: Web Dev" });
    const result = adaptCartridgeToCourseContent(data, "fallback name");
    expect(result.courseName).toBe("INFO 1020: Web Dev");
  });

  it("falls back to the course's saved name when the cartridge has no title", () => {
    const data = baseData({ title: null });
    const result = adaptCartridgeToCourseContent(data, "INFO 1020 (saved)");
    expect(result.courseName).toBe("INFO 1020 (saved)");
  });

  it("always returns an empty pages array - a cartridge has no standalone page list", () => {
    const result = adaptCartridgeToCourseContent(baseData(), "fallback");
    expect(result.pages).toEqual([]);
  });

  it("passes modules through unchanged, by reference, with no per-item remapping", () => {
    const modules: CartridgeModule[] = [
      {
        name: "Module 01",
        position: 1,
        identifier: "mod_1",
        items: [{ title: "Welcome", type: "Page", identifier: "item_1", body: "Hello" }],
      },
    ];
    const data = baseData({ modules });
    const result = adaptCartridgeToCourseContent(data, "fallback");
    // Reference equality proves the array was passed through, not rebuilt
    // via a .map() (or similar) that could silently drop an optional field.
    expect(result.modules).toBe(modules);
  });

  it("preserves a module with no items as items: []", () => {
    const modules: CartridgeModule[] = [{ name: "Empty Module", position: 1, items: [] }];
    const data = baseData({ modules });
    const result = adaptCartridgeToCourseContent(data, "fallback");
    expect(result.modules[0].items).toEqual([]);
  });

  it("preserves an item with no identifier as a genuine absence, not a fabricated value", () => {
    const modules: CartridgeModule[] = [
      { name: "Module 01", position: 1, items: [{ title: "No id here", type: "Page" }] },
    ];
    const data = baseData({ modules });
    const result = adaptCartridgeToCourseContent(data, "fallback");
    const item = result.modules[0].items[0];
    expect(Object.prototype.hasOwnProperty.call(item, "identifier")).toBe(false);
    expect(item.identifier).toBeUndefined();
  });

  it("preserves a blank item type unchanged (generic-cartridge caveat, entry 261)", () => {
    const modules: CartridgeModule[] = [
      { name: "Module 01", position: 1, items: [{ title: "Untyped item", type: "" }] },
    ];
    const data = baseData({ modules });
    const result = adaptCartridgeToCourseContent(data, "fallback");
    expect(result.modules[0].items[0].type).toBe("");
  });

  it("never fabricates a Canvas-only field on an item (id, published, dueAt, pointsPossible, etc.)", () => {
    const modules: CartridgeModule[] = [
      { name: "Module 01", position: 1, items: [{ title: "Assignment 1", type: "Assignment" }] },
    ];
    const data = baseData({ modules });
    const result = adaptCartridgeToCourseContent(data, "fallback");
    const item = result.modules[0].items[0] as unknown as Record<string, unknown>;
    for (const canvasOnlyField of [
      "id",
      "moduleId",
      "contentId",
      "pageUrl",
      "htmlUrl",
      "externalUrl",
      "published",
      "indent",
      "dueAt",
      "pointsPossible",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(item, canvasOnlyField)).toBe(false);
    }
  });
});
