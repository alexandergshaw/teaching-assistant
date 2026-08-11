import { describe, expect, it } from "vitest";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";
import {
  canvasModuleToDisplay,
  canvasModulesToDisplay,
  cartridgeModuleToDisplay,
  cartridgeModulesToDisplay,
} from "./display-module-tree";

// Every Canvas-only field docs/REGRESSION.md entry 263 check 3 names beyond
// title/type - a cartridge-derived DisplayModuleItem must have NONE of these
// as an own property.
const CANVAS_ONLY_ITEM_FIELDS = [
  "id",
  "moduleId",
  "position",
  "indent",
  "published",
  "pageUrl",
  "contentId",
  "dueAt",
  "pointsPossible",
  "htmlUrl",
  "externalUrl",
] as const;

const CANVAS_ONLY_MODULE_FIELDS = ["id", "position", "published", "itemsCount"] as const;

function makeCanvasItem(overrides: Partial<CanvasModuleItem> = {}): CanvasModuleItem {
  return {
    id: 101,
    moduleId: 9,
    title: "Week 1 reading",
    type: "Page",
    position: 1,
    indent: 0,
    published: true,
    pageUrl: "week-1-reading",
    contentId: null,
    dueAt: null,
    pointsPossible: null,
    htmlUrl: "https://canvas.example.edu/courses/1/pages/week-1-reading",
    externalUrl: null,
    ...overrides,
  };
}

function makeCanvasModule(overrides: Partial<CanvasModule> = {}): CanvasModule {
  return {
    id: 9,
    name: "Week 1",
    position: 1,
    published: true,
    itemsCount: 1,
    items: [makeCanvasItem()],
    ...overrides,
  };
}

describe("canvasItemToDisplay (via canvasModuleToDisplay)", () => {
  it("round-trips a live item with every field present", () => {
    const source = makeCanvasItem({
      id: 555,
      moduleId: 42,
      title: "Essay 1",
      type: "Assignment",
      position: 3,
      indent: 1,
      published: false,
      pageUrl: null,
      contentId: 777,
      dueAt: "2026-09-01T04:59:00.000Z",
      pointsPossible: 20,
      htmlUrl: "https://canvas.example.edu/courses/1/assignments/777",
      externalUrl: null,
    });
    const [display] = canvasModuleToDisplay(makeCanvasModule({ items: [source] })).items;

    expect(display.source).toBe("canvas");
    expect(display.id).toBe(555);
    expect(display.moduleId).toBe(42);
    expect(display.title).toBe("Essay 1");
    expect(display.type).toBe("Assignment");
    expect(display.position).toBe(3);
    expect(display.indent).toBe(1);
    expect(display.published).toBe(false);
    expect(display.pageUrl).toBeNull();
    expect(display.contentId).toBe(777);
    expect(display.dueAt).toBe("2026-09-01T04:59:00.000Z");
    expect(display.pointsPossible).toBe(20);
    expect(display.htmlUrl).toBe("https://canvas.example.edu/courses/1/assignments/777");
    expect(display.externalUrl).toBeNull();
    // The exact source object, not a clone - reference equality, mirroring
    // entry 263 check 2's own reference-equality pin on the export adapter.
    expect(display.raw).toBe(source);
    // Never fabricated on a live item.
    expect(display).not.toHaveProperty("identifier");
    expect(display).not.toHaveProperty("body");
  });

  it("round-trips a live module's own fields, with `raw` the exact source object", () => {
    const source = makeCanvasModule({ id: 9001, name: "Midterm unit", position: 4, published: false, itemsCount: 2 });
    const display = canvasModuleToDisplay(source);

    expect(display.source).toBe("canvas");
    expect(display.id).toBe(9001);
    expect(display.name).toBe("Midterm unit");
    expect(display.position).toBe(4);
    expect(display.published).toBe(false);
    expect(display.itemsCount).toBe(2);
    expect(display.raw).toBe(source);
    expect(display).not.toHaveProperty("identifier");
  });

  it("preserves module order", () => {
    const modules = [
      makeCanvasModule({ id: 1, name: "First" }),
      makeCanvasModule({ id: 2, name: "Second" }),
      makeCanvasModule({ id: 3, name: "Third" }),
    ];
    expect(canvasModulesToDisplay(modules).map((m) => m.name)).toEqual(["First", "Second", "Third"]);
  });
});

function makeCartridgeItem(overrides: Partial<CartridgeModuleItem> = {}): CartridgeModuleItem {
  return { title: "Module overview", type: "Page", ...overrides };
}

function makeCartridgeModule(overrides: Partial<CartridgeModule> = {}): CartridgeModule {
  return { name: "Unit 1", position: 1, items: [makeCartridgeItem()], ...overrides };
}

describe("cartridgeItemToDisplay (via cartridgeModuleToDisplay)", () => {
  it("carries identifier and body when the cartridge item has them, and fabricates no Canvas-only field", () => {
    const source = makeCartridgeItem({
      title: "Syllabus",
      type: "Page",
      identifier: "res00042",
      body: "Welcome to the course.",
    });
    const [display] = cartridgeModuleToDisplay(makeCartridgeModule({ items: [source] })).items;

    expect(display.source).toBe("export");
    expect(display.title).toBe("Syllabus");
    expect(display.type).toBe("Page");
    expect(display.identifier).toBe("res00042");
    expect(display.body).toBe("Welcome to the course.");

    // hasOwnProperty, not toBeUndefined: a fabricated `undefined` own
    // property would pass toBeUndefined() but must still fail this.
    for (const field of CANVAS_ONLY_ITEM_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(display, field)).toBe(false);
    }
    expect(Object.prototype.hasOwnProperty.call(display, "raw")).toBe(false);
  });

  it("leaves identifier and body absent (not undefined-valued) when the cartridge item has neither", () => {
    const source = makeCartridgeItem({ title: "Untitled resource", type: "File" });
    const [display] = cartridgeModuleToDisplay(makeCartridgeModule({ items: [source] })).items;

    expect(Object.prototype.hasOwnProperty.call(display, "identifier")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(display, "body")).toBe(false);
  });

  it("keeps a blank type blank rather than defaulting it", () => {
    const source = makeCartridgeItem({ title: "Mystery item", type: "" });
    const [display] = cartridgeModuleToDisplay(makeCartridgeModule({ items: [source] })).items;

    expect(display.type).toBe("");
  });

  it("converts a module with no Canvas-only field fabricated, identifier included only when present", () => {
    const withIdentifier = cartridgeModuleToDisplay(makeCartridgeModule({ name: "Unit 2", identifier: "mod-2" }));
    expect(withIdentifier.source).toBe("export");
    expect(withIdentifier.name).toBe("Unit 2");
    expect(withIdentifier.identifier).toBe("mod-2");
    for (const field of CANVAS_ONLY_MODULE_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(withIdentifier, field)).toBe(false);
    }
    expect(Object.prototype.hasOwnProperty.call(withIdentifier, "raw")).toBe(false);

    const withoutIdentifier = cartridgeModuleToDisplay(makeCartridgeModule({ name: "Unit 3", identifier: undefined }));
    expect(Object.prototype.hasOwnProperty.call(withoutIdentifier, "identifier")).toBe(false);
  });

  it("preserves module order", () => {
    const modules = [
      makeCartridgeModule({ name: "Alpha" }),
      makeCartridgeModule({ name: "Beta" }),
      makeCartridgeModule({ name: "Gamma" }),
    ];
    expect(cartridgeModulesToDisplay(modules).map((m) => m.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});
