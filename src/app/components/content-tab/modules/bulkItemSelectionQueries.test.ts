// Direct tests for the pure selection queries extracted out of
// useBulkItemActions.ts (see ./bulkItemSelectionQueries.ts's own header for
// why they moved). Neither function was independently testable before the
// move - useBulkItemActions is a stateful hook (useState/async) that this
// repo's node-env vitest cannot render, so this logic was previously
// exercised only indirectly, if at all.
import { describe, expect, it } from "vitest";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { computeSelectedGradables, groupIdsByKind } from "./bulkItemSelectionQueries";

function item(id: number, overrides: Partial<CanvasModuleItem>): CanvasModuleItem {
  return {
    id,
    moduleId: 1,
    title: `Item ${id}`,
    type: "Page",
    position: 1,
    indent: 0,
    published: true,
    pageUrl: null,
    contentId: null,
    dueAt: null,
    pointsPossible: null,
    htmlUrl: null,
    externalUrl: null,
    ...overrides,
  };
}

describe("computeSelectedGradables", () => {
  it("includes a selected Assignment/Quiz/Discussion item that has a contentId", () => {
    const modules: CanvasModule[] = [
      {
        id: 1,
        name: "Module 1",
        position: 1,
        published: true,
        itemsCount: 1,
        items: [item(10, { type: "Assignment", contentId: 100, dueAt: "2026-01-01T00:00:00Z", pointsPossible: 50 })],
      },
    ];
    const selected = new Set(["live:1:10"]);
    const result = computeSelectedGradables(modules, selected);
    expect(result).toEqual([{ type: "Assignment", contentId: 100, dueAt: "2026-01-01T00:00:00Z", pointsPossible: 50 }]);
  });

  it("excludes an item that is not selected", () => {
    const modules: CanvasModule[] = [
      { id: 1, name: "Module 1", position: 1, published: true, itemsCount: 1, items: [item(10, { type: "Assignment", contentId: 100 })] },
    ];
    expect(computeSelectedGradables(modules, new Set())).toEqual([]);
  });

  it("excludes a selected item of an ungradable type (e.g. Page)", () => {
    const modules: CanvasModule[] = [
      { id: 1, name: "Module 1", position: 1, published: true, itemsCount: 1, items: [item(10, { type: "Page", pageUrl: "syllabus" })] },
    ];
    expect(computeSelectedGradables(modules, new Set(["live:1:10"]))).toEqual([]);
  });

  it("excludes a selected gradable-typed item with no contentId (e.g. an unpublished shell)", () => {
    const modules: CanvasModule[] = [
      { id: 1, name: "Module 1", position: 1, published: true, itemsCount: 1, items: [item(10, { type: "Assignment", contentId: null })] },
    ];
    expect(computeSelectedGradables(modules, new Set(["live:1:10"]))).toEqual([]);
  });
});

describe("groupIdsByKind", () => {
  it("groups selected items' contentIds by their Canvas type", () => {
    const items = [
      { item: item(1, { type: "Assignment", contentId: 10 }), moduleId: 1 },
      { item: item(2, { type: "Assignment", contentId: 11 }), moduleId: 1 },
      { item: item(3, { type: "Quiz", contentId: 20 }), moduleId: 1 },
    ];
    const result = groupIdsByKind(items, ["Assignment", "Quiz"]);
    expect(result).toEqual({ Assignment: ["10", "11"], Quiz: ["20"] });
  });

  it("excludes a kind not in the requested list", () => {
    const items = [{ item: item(1, { type: "Discussion", contentId: 10 }), moduleId: 1 }];
    const result = groupIdsByKind(items, ["Assignment"]);
    expect(result).toEqual({});
  });

  it("excludes an item of a requested kind with no contentId", () => {
    const items = [{ item: item(1, { type: "Assignment", contentId: null }), moduleId: 1 }];
    expect(groupIdsByKind(items, ["Assignment"])).toEqual({});
  });

  it("uses a Page item's pageUrl (slug), not its contentId, when usePageSlug is true", () => {
    const items = [{ item: item(1, { type: "Page", pageUrl: "syllabus", contentId: null }), moduleId: 1 }];
    expect(groupIdsByKind(items, ["Page"], true)).toEqual({ Page: ["syllabus"] });
  });

  it("excludes a Page item's slug when usePageSlug is false (default)", () => {
    const items = [{ item: item(1, { type: "Page", pageUrl: "syllabus", contentId: null }), moduleId: 1 }];
    expect(groupIdsByKind(items, ["Page"])).toEqual({});
  });
});
