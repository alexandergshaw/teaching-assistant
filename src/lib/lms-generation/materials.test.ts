import { describe, it, expect, vi } from "vitest";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";
import {
  gatherSelectionMaterials,
  expandModuleSelection,
  DESCRIPTION_FETCH_LIMIT,
  MATERIALS_CAP,
  type LiveSelectedItem,
  type ExportSelectedItem,
  type MaterialsFetchers,
  type SelectedMaterialItem,
} from "./materials";

const CANVAS_URL = "https://canvas.example.edu/courses/100";

function liveItem(overrides: Partial<CanvasModuleItem>): CanvasModuleItem {
  return {
    id: 1,
    moduleId: 10,
    title: "Untitled item",
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

function liveEntry(key: string, moduleId: number, overrides: Partial<CanvasModuleItem>): LiveSelectedItem {
  return { source: "live", key, moduleId, item: liveItem(overrides) };
}

function exportEntry(key: string, moduleRef: string, item: CartridgeModuleItem): ExportSelectedItem {
  return { source: "export", key, moduleRef, item };
}

function canvasModule(id: number, items: Array<Partial<CanvasModuleItem>>): CanvasModule {
  return {
    id,
    name: `Module ${id}`,
    position: 1,
    published: true,
    itemsCount: items.length,
    items: items.map((overrides, i) => liveItem({ id: i + 1, moduleId: id, ...overrides })),
  };
}

function fakeFetchers(overrides: Partial<MaterialsFetchers> = {}): MaterialsFetchers {
  return {
    getPage: vi.fn(async () => ({ page: { title: "unused", body: "" } })),
    previewFile: vi.fn(async () => ({ preview: { text: "" } })),
    fetchMeta: vi.fn(async () => ({ description: "" })),
    ...overrides,
  };
}

describe("gatherSelectionMaterials - live items", () => {
  it("reads a Page item's body via getPage, stripping tags and collapsing whitespace", async () => {
    const fetchers = fakeFetchers({
      getPage: vi.fn(async () => ({ page: { title: "Syllabus", body: "<p>Hello   <b>world</b></p>" } })),
    });
    const result = await gatherSelectionMaterials([liveEntry("live:10:1", 10, { type: "Page", pageUrl: "syllabus" })], {
      canvasUrl: CANVAS_URL,
      fetchers,
    });
    expect(result.materialsText).toBe("# Syllabus\nHello world\n\n");
    expect(fetchers.getPage).toHaveBeenCalledWith(CANVAS_URL, "syllabus", undefined);
  });

  it("reads a File item's extracted text via previewFile", async () => {
    const fetchers = fakeFetchers({
      previewFile: vi.fn(async () => ({ preview: { text: "extracted file text" } })),
    });
    const result = await gatherSelectionMaterials(
      [liveEntry("live:10:2", 10, { type: "File", contentId: 55, title: "handout.pdf" })],
      { canvasUrl: CANVAS_URL, fetchers }
    );
    expect(result.materialsText).toBe("# handout.pdf\nextracted file text\n\n");
  });

  it("omits an empty File preview without leaving a note (matches gatherLiveModuleItems)", async () => {
    const fetchers = fakeFetchers({ previewFile: vi.fn(async () => ({ preview: { text: "   " } })) });
    const result = await gatherSelectionMaterials(
      [liveEntry("live:10:2", 10, { type: "File", contentId: 55, title: "empty.pdf" })],
      { canvasUrl: CANVAS_URL, fetchers }
    );
    expect(result.materialsText).toBe("");
    expect(result.notes).toEqual([]);
  });

  it("fetches an Assignment's description and includes points/due-date suffixes", async () => {
    const fetchers = fakeFetchers({ fetchMeta: vi.fn(async () => ({ description: "Read chapters 1-3." })) });
    const result = await gatherSelectionMaterials(
      [
        liveEntry("live:10:3", 10, {
          type: "Assignment",
          contentId: 7,
          title: "Reading response",
          htmlUrl: "https://canvas.example.edu/courses/100/assignments/7",
          pointsPossible: 10,
          dueAt: "2026-09-01T00:00:00Z",
        }),
      ],
      { canvasUrl: CANVAS_URL, fetchers }
    );
    expect(result.materialsText).toContain("Assignment: Reading response (10 points, due");
    expect(result.materialsText).toContain("Read chapters 1-3.");
  });

  it("gives a Quiz a header-only line (no description fetch)", async () => {
    const fetchers = fakeFetchers();
    const result = await gatherSelectionMaterials(
      [liveEntry("live:10:4", 10, { type: "Quiz", title: "Midterm", pointsPossible: 50 })],
      { canvasUrl: CANVAS_URL, fetchers }
    );
    expect(result.materialsText).toBe("Quiz: Midterm (50 points)\n");
    expect(fetchers.fetchMeta).not.toHaveBeenCalled();
  });

  it("produces nothing for an unsupported item type (e.g. SubHeader)", async () => {
    const result = await gatherSelectionMaterials([liveEntry("live:10:5", 10, { type: "SubHeader", title: "Section" })], {
      canvasUrl: CANVAS_URL,
      fetchers: fakeFetchers(),
    });
    expect(result.materialsText).toBe("");
    expect(result.notes).toEqual([]);
  });

  it("fails forward: a per-item fetch error becomes a note, other items still process", async () => {
    const fetchers = fakeFetchers({
      getPage: vi
        .fn()
        .mockResolvedValueOnce({ error: "Canvas is down" })
        .mockResolvedValueOnce({ page: { title: "Ok page", body: "fine" } }),
    });
    const result = await gatherSelectionMaterials(
      [
        liveEntry("live:10:1", 10, { type: "Page", pageUrl: "broken", title: "Broken page" }),
        liveEntry("live:10:2", 10, { type: "Page", pageUrl: "ok", title: "Second page" }),
      ],
      { canvasUrl: CANVAS_URL, fetchers }
    );
    expect(result.notes).toEqual(["Broken page: Canvas is down"]);
    expect(result.materialsText).toContain("Ok page");
  });

  it("respects the 6-description cap across the whole batch and records the omission note", async () => {
    const fetchMeta = vi.fn(async () => ({ description: "desc" }));
    const fetchers = fakeFetchers({ fetchMeta });
    const items: LiveSelectedItem[] = Array.from({ length: 8 }, (_, i) =>
      liveEntry(`live:10:${i}`, 10, {
        id: i,
        type: "Assignment",
        contentId: i,
        title: `Assignment ${i}`,
        htmlUrl: `https://canvas.example.edu/courses/100/assignments/${i}`,
      })
    );
    const result = await gatherSelectionMaterials(items, { canvasUrl: CANVAS_URL, fetchers });

    expect(fetchMeta).toHaveBeenCalledTimes(DESCRIPTION_FETCH_LIMIT);
    expect(result.notes).toContain("further assignment descriptions omitted (2 more)");
    // The two beyond the cap still get a header-only line, just no description fetch.
    expect(result.materialsText).toContain("Assignment: Assignment 6");
    expect(result.materialsText).toContain("Assignment: Assignment 7");
  });
});

describe("gatherSelectionMaterials - export items", () => {
  it("grounds on title/type/body and notes the missing fields when a body is present", async () => {
    const result = await gatherSelectionMaterials(
      [exportEntry("export:m1:i1", "m1", { title: "Week 2 reading", type: "Assignment", body: "Read pages 1-20." })],
      { canvasUrl: "", fetchers: fakeFetchers() }
    );
    expect(result.materialsText).toBe("Assignment: Week 2 reading\nRead pages 1-20.\n\n");
    expect(result.notes).toEqual([
      "Week 2 reading: export-sourced item - grounded on title/type/body only (due date, points, and a fetched description are not available for export-sourced items)",
    ]);
  });

  it("grounds on title/type only (no body) and says so distinctly when body is absent", async () => {
    const result = await gatherSelectionMaterials(
      [exportEntry("export:m1:i2", "m1", { title: "Week 2 quiz", type: "Quiz" })],
      { canvasUrl: "", fetchers: fakeFetchers() }
    );
    expect(result.materialsText).toBe("Quiz: Week 2 quiz\n");
    expect(result.notes).toEqual([
      "Week 2 quiz: export-sourced item - grounded on title/type only (due date, points, and a fetched description are not available for export-sourced items)",
    ]);
  });

  it("never calls any live fetcher for an export-sourced item", async () => {
    const fetchers = fakeFetchers();
    await gatherSelectionMaterials([exportEntry("export:m1:i1", "m1", { title: "X", type: "Page", body: "y" })], {
      canvasUrl: CANVAS_URL,
      fetchers,
    });
    expect(fetchers.getPage).not.toHaveBeenCalled();
    expect(fetchers.previewFile).not.toHaveBeenCalled();
    expect(fetchers.fetchMeta).not.toHaveBeenCalled();
  });
});

describe("gatherSelectionMaterials - the materials cap", () => {
  it("truncates combined text at MATERIALS_CAP characters and records a note", async () => {
    const fetchers = fakeFetchers({
      getPage: vi.fn(async () => ({ page: { title: "Huge", body: "a".repeat(MATERIALS_CAP + 5000) } })),
    });
    const result = await gatherSelectionMaterials([liveEntry("live:10:1", 10, { type: "Page", pageUrl: "huge" })], {
      canvasUrl: CANVAS_URL,
      fetchers,
    });
    expect(result.materialsText.length).toBe(MATERIALS_CAP);
    expect(result.notes).toContain(`materials truncated to ~${MATERIALS_CAP} characters`);
  });

  it("does not add a truncation note when the text is under the cap", async () => {
    const fetchers = fakeFetchers({ getPage: vi.fn(async () => ({ page: { title: "Small", body: "short body" } })) });
    const result = await gatherSelectionMaterials([liveEntry("live:10:1", 10, { type: "Page", pageUrl: "small" })], {
      canvasUrl: CANVAS_URL,
      fetchers,
    });
    expect(result.notes.some((n) => n.includes("truncated"))).toBe(false);
  });
});

function cartridgeModule(identifier: string, items: CartridgeModuleItem[]): CartridgeModule {
  return { name: `Export module ${identifier}`, position: 1, identifier, items };
}

describe("expandModuleSelection", () => {
  it("expands a selected LIVE module key into every one of its items", () => {
    const mod = canvasModule(10, [{ type: "Page", title: "P1" }, { type: "Quiz", title: "Q1" }]);
    const result = expandModuleSelection([], ["live:10"], [mod]);
    expect(result).toEqual([
      { source: "live", key: "live:10:1", moduleId: 10, item: mod.items[0] },
      { source: "live", key: "live:10:2", moduleId: 10, item: mod.items[1] },
    ]);
  });

  it("ignores live modules that were not selected", () => {
    const selectedMod = canvasModule(10, [{ type: "Page", title: "In" }]);
    const otherMod = canvasModule(20, [{ type: "Page", title: "Out" }]);
    const result = expandModuleSelection([], ["live:10"], [selectedMod, otherMod]);
    expect(result).toHaveLength(1);
    expect((result[0] as LiveSelectedItem).moduleId).toBe(10);
  });

  it("returns the individually-selected items unchanged when no module is selected", () => {
    const entry = liveEntry("live:10:1", 10, { type: "Page", title: "solo" });
    expect(expandModuleSelection([entry], [], [canvasModule(10, [{ type: "Page" }])])).toEqual([entry]);
  });

  it("THE DOUBLE-COUNT GUARD: an item both individually selected AND inside a selected module is included exactly once", () => {
    // docs/REGRESSION.md entry 260 check 1: `selected` (item keys) and
    // `selectedModules` (module keys) are two ORTHOGONAL Sets, so an
    // instructor can legitimately have module 10 selected as a whole AND
    // one of its own items individually selected at the same time.
    const mod = canvasModule(10, [{ type: "Page", title: "Item 1" }, { type: "Quiz", title: "Item 2" }]);
    const individuallySelected = liveEntry("live:10:1", 10, { id: 1, type: "Page", title: "Item 1" });

    const result = expandModuleSelection([individuallySelected], ["live:10"], [mod]);

    expect(result).toHaveLength(2);
    const keys = result.map((r) => r.key);
    expect(keys).toEqual(["live:10:1", "live:10:2"]);
    // The individually-selected entry is preserved AS GIVEN (not rebuilt
    // from the module tree), and item 2 is added once from the module.
    expect(result[0]).toBe(individuallySelected);
  });

  it("a mixed selection spanning two modules, one of them also individually represented, still dedupes only the shared item", () => {
    const modA = canvasModule(10, [{ type: "Page", title: "A1" }]);
    const modB = canvasModule(20, [{ type: "Page", title: "B1" }, { type: "Quiz", title: "B2" }]);
    const individuallySelected = liveEntry("live:20:1", 20, { id: 1, type: "Page", title: "B1" });

    const result = expandModuleSelection([individuallySelected], ["live:10", "live:20"], [modA, modB]);

    const keys = result.map((r) => r.key).sort();
    expect(keys).toEqual(["live:10:1", "live:20:1", "live:20:2"]);
  });

  it("respects DESCRIPTION_FETCH_LIMIT and records the omission note when a selected module alone exceeds it", async () => {
    // Proves the cap applies to MODULE-EXPANDED items exactly as it already
    // does to individually-selected ones (materials.test.ts's own
    // "respects the 6-description cap" case above) - expanding modules
    // makes hitting this cap far more likely, so it must still hold.
    const items: Array<Partial<CanvasModuleItem>> = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      type: "Assignment",
      contentId: i,
      title: `Assignment ${i}`,
      htmlUrl: `https://canvas.example.edu/courses/100/assignments/${i}`,
    }));
    const mod = canvasModule(30, items);
    const fetchMeta = vi.fn(async () => ({ description: "desc" }));
    const fetchers = fakeFetchers({ fetchMeta });

    const expanded = expandModuleSelection([], ["live:30"], [mod]);
    const result = await gatherSelectionMaterials(expanded, { canvasUrl: CANVAS_URL, fetchers });

    expect(fetchMeta).toHaveBeenCalledTimes(DESCRIPTION_FETCH_LIMIT);
    expect(result.notes).toContain("further assignment descriptions omitted (2 more)");
  });

  it("respects MATERIALS_CAP when a selected module's expanded items exceed it", async () => {
    const mod = canvasModule(40, [{ type: "Page", pageUrl: "huge", title: "Huge" }]);
    const fetchers = fakeFetchers({
      getPage: vi.fn(async () => ({ page: { title: "Huge", body: "a".repeat(MATERIALS_CAP + 5000) } })),
    });

    const expanded = expandModuleSelection([], ["live:40"], [mod]);
    const result = await gatherSelectionMaterials(expanded, { canvasUrl: CANVAS_URL, fetchers });

    expect(result.materialsText.length).toBe(MATERIALS_CAP);
    expect(result.notes).toContain(`materials truncated to ~${MATERIALS_CAP} characters`);
  });

  it("a module-only selection (empty items array) still produces usable materials", async () => {
    const mod = canvasModule(50, [{ type: "Page", pageUrl: "syllabus", title: "Week 5" }]);
    const fetchers = fakeFetchers({
      getPage: vi.fn(async () => ({ page: { title: "Week 5", body: "Read chapter 5." } })),
    });

    const expanded: SelectedMaterialItem[] = expandModuleSelection([], ["live:50"], [mod]);
    const result = await gatherSelectionMaterials(expanded, { canvasUrl: CANVAS_URL, fetchers });

    expect(result.materialsText).toContain("Read chapter 5.");
  });

  describe("export module keys", () => {
    it("expands a selected EXPORT module key into every one of its items", () => {
      const mod = cartridgeModule("m1", [
        { title: "Reading", type: "Assignment", identifier: "i1", body: "Read ch. 1" },
        { title: "Quiz", type: "Quiz", identifier: "i2" },
      ]);
      const result = expandModuleSelection([], ["export:m1"], [], [mod]);
      expect(result).toEqual([
        { source: "export", key: "export:m1:i1", moduleRef: "m1", item: mod.items[0] },
        { source: "export", key: "export:m1:i2", moduleRef: "m1", item: mod.items[1] },
      ]);
    });

    it("passing allModules=[] expands ONLY the export half - no live tree, nothing live sneaks in", () => {
      const exportMod = cartridgeModule("m1", [{ title: "X", type: "Page", identifier: "i1" }]);
      const result = expandModuleSelection([], ["live:10", "export:m1"], [], [exportMod]);
      expect(result).toEqual([{ source: "export", key: "export:m1:i1", moduleRef: "m1", item: exportMod.items[0] }]);
    });

    it("omitting exportModules expands ONLY the live half - an export key contributes nothing without a tree", () => {
      const mod = canvasModule(10, [{ type: "Page", title: "P1" }]);
      const result = expandModuleSelection([], ["live:10", "export:m1"], [mod]);
      expect(result).toEqual([{ source: "live", key: "live:10:1", moduleId: 10, item: mod.items[0] }]);
    });

    it("skips an export module or item with no identifier - it could never have been selected via exportModuleKey/exportItemKey", () => {
      const modNoId = { name: "No id", position: 1, items: [{ title: "X", type: "Page", identifier: "i1" }] } as CartridgeModule;
      const modWithIdButItemNoId = cartridgeModule("m2", [{ title: "Y", type: "Page" }]);
      const result = expandModuleSelection([], ["export:m2"], [], [modNoId, modWithIdButItemNoId]);
      expect(result).toEqual([]);
    });

    it("a mixed live+export selection expands both halves and dedupes independently per source", () => {
      // AC: "a mixed live+export selection is handled" - resolved here by
      // running the SAME dedup machinery (seenKeys) across both sources at
      // once, since a live key and an export key can never collide (see the
      // "never collide" test below), so one seenKeys Set safely covers both.
      const liveMod = canvasModule(10, [{ type: "Page", title: "L1" }]);
      const exportMod = cartridgeModule("m1", [{ title: "E1", type: "Page", identifier: "i1" }]);
      const individuallySelectedExport = exportEntry("export:m1:i1", "m1", { title: "E1", type: "Page", identifier: "i1" });

      const result = expandModuleSelection([individuallySelectedExport], ["live:10", "export:m1"], [liveMod], [exportMod]);

      const keys = result.map((r) => r.key).sort();
      // live:10:1 comes from the live expansion; export:m1:i1 is the
      // individually-selected entry, preserved as given and NOT duplicated
      // by the export module expansion (same double-count guard as live).
      expect(keys).toEqual(["export:m1:i1", "live:10:1"]);
      expect(result.filter((r) => r.key === "export:m1:i1")).toHaveLength(1);
    });

    it("a live module ref and an export module ref that are numerically identical never collide", () => {
      const liveMod = canvasModule(1, [{ type: "Page", title: "Live one" }]);
      const exportMod = cartridgeModule("1", [{ title: "Export one", type: "Page", identifier: "1" }]);
      const result = expandModuleSelection([], ["live:1", "export:1"], [liveMod], [exportMod]);
      const keys = result.map((r) => r.key).sort();
      expect(keys).toEqual(["export:1:1", "live:1:1"]);
    });

    it("THE 1-vs-12 COLLISION GUARD holds for export module keys too: module ref '1' does not also expand ref '12'", () => {
      const mod1 = cartridgeModule("1", [{ title: "Mod 1 item", type: "Page", identifier: "i1" }]);
      const mod12 = cartridgeModule("12", [{ title: "Mod 12 item", type: "Page", identifier: "i2" }]);
      const result = expandModuleSelection([], ["export:1"], [], [mod1, mod12]);
      expect(result).toEqual([{ source: "export", key: "export:1:i1", moduleRef: "1", item: mod1.items[0] }]);
    });

    it("an export-sourced item selection reaches gatherExportItem through the real generation pipeline", async () => {
      const exportMod = cartridgeModule("m1", [{ title: "Week 2 reading", type: "Assignment", identifier: "i1", body: "Read pages 1-20." }]);
      const expanded = expandModuleSelection([], ["export:m1"], [], [exportMod]);
      const result = await gatherSelectionMaterials(expanded, { canvasUrl: "", fetchers: fakeFetchers() });
      expect(result.materialsText).toBe("Assignment: Week 2 reading\nRead pages 1-20.\n\n");
      expect(result.notes).toEqual([
        "Week 2 reading: export-sourced item - grounded on title/type/body only (due date, points, and a fetched description are not available for export-sourced items)",
      ]);
    });
  });
});
