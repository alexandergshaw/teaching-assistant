import { describe, expect, it } from "vitest";
import type { CartridgeCourseData, CartridgeModule } from "@/lib/cartridge-import";
import type { CartridgeAnnouncement, CartridgeRubric } from "@/lib/cartridge-import-shared";
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

  it("carries rubrics through verbatim when the cartridge has them", () => {
    const rubrics: CartridgeRubric[] = [
      {
        title: "Essay Rubric",
        criteria: [
          {
            description: "Thesis clarity",
            points: 10,
            longDescription: "Is the thesis clearly stated?",
            ratings: [{ description: "Excellent", points: 10 }],
          },
        ],
      },
    ];
    const data = baseData({ rubrics });
    const result = adaptCartridgeToCourseContent(data, "fallback");
    expect(result.rubrics).toBe(rubrics);
    expect(result.rubrics).toEqual(rubrics);
  });

  it("yields an empty rubrics array, not undefined, when the cartridge has none", () => {
    const data = baseData({ rubrics: [] });
    const result = adaptCartridgeToCourseContent(data, "fallback");
    expect(result.rubrics).toEqual([]);
    expect(result.rubrics).not.toBeUndefined();
  });

  it("carries announcements through verbatim when the cartridge has them", () => {
    const announcements: CartridgeAnnouncement[] = [
      { title: "Week 1", body: "Welcome.", releaseDate: "2026-08-17 04:30:00 MDT", order: 1, isDraft: true },
    ];
    const data = baseData({ announcements });
    const result = adaptCartridgeToCourseContent(data, "fallback");
    expect(result.announcements).toBe(announcements);
    expect(result.announcements).toEqual(announcements);
  });

  it("defaults announcements to an empty array (not undefined) when CartridgeCourseData.announcements is absent - AC4's asymmetry with rubrics", () => {
    // Unlike `rubrics` (required, always populated by every existing
    // parser), `CartridgeCourseData.announcements` is OPTIONAL - `baseData`
    // above never sets it, exactly like every pre-existing
    // CartridgeCourseData fixture elsewhere in the codebase. This is the one
    // place that optionality gets resolved into ExportCourseContent's own
    // always-an-array guarantee.
    const data = baseData();
    expect(data.announcements).toBeUndefined();
    const result = adaptCartridgeToCourseContent(data, "fallback");
    expect(result.announcements).toEqual([]);
    expect(result.announcements).not.toBeUndefined();
  });
});
