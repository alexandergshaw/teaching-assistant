// Node-env tests for the stateful half of the bulk "set open-in-a-new-tab"
// action (docs/bulk-open-in-new-tab-acceptance-criteria.md). The PURE half
// (classifyNewTabTarget, the outcome type, the summariser, the copy) is
// exercised directly by bulkNewTabSummary.test.ts; this file is only about
// runBulkNewTabAction's OWN orchestration - that it classifies every item
// BEFORE writing anything, writes only the items that actually need it, and
// turns a real write's result (success or a returned {error}) into the
// correct final outcome, never inventing one for an item it never wrote to.
import { describe, expect, it, vi } from "vitest";
import type { CanvasModuleItem } from "@/lib/canvas-modules";
import { runBulkNewTabAction } from "./bulkNewTabRunner";

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
    newTab: null,
    ...overrides,
  };
}

describe("runBulkNewTabAction", () => {
  it("never calls writeItem for an ineligible-kind item - classifyNewTabTarget resolves it before any write is attempted", async () => {
    const writeItem = vi.fn();
    const assignment = item(1, { type: "Assignment", newTab: null });

    const { report } = await runBulkNewTabAction([{ item: assignment, moduleId: 1 }], true, writeItem);

    expect(writeItem).not.toHaveBeenCalled();
    expect(report.ineligible).toBe(1);
    expect(report.updated).toBe(0);
  });

  it("never calls writeItem for an eligible item already at the requested value", async () => {
    const writeItem = vi.fn();
    const link = item(1, { type: "ExternalUrl", newTab: true });

    const { report } = await runBulkNewTabAction([{ item: link, moduleId: 1 }], true, writeItem);

    expect(writeItem).not.toHaveBeenCalled();
    expect(report.unchanged).toBe(1);
    expect(report.updated).toBe(0);
  });

  it("writes only an eligible item whose current value differs from the requested one, and reports it updated on success", async () => {
    const writeItem = vi.fn().mockResolvedValue({ ok: true });
    const link = item(1, { type: "ExternalUrl", newTab: false });

    const { report, note } = await runBulkNewTabAction([{ item: link, moduleId: 7 }], true, writeItem);

    expect(writeItem).toHaveBeenCalledTimes(1);
    expect(writeItem).toHaveBeenCalledWith(link, 7, true);
    expect(report.updated).toBe(1);
    expect(note.kind).toBe("success");
  });

  it("carries the real Canvas error string through as a 'failed' outcome, never swallowing it into a bare count", async () => {
    const writeItem = vi.fn().mockResolvedValue({ error: "Canvas returned 422" });
    const tool = item(1, { type: "ExternalTool", newTab: false });

    const { report, note } = await runBulkNewTabAction([{ item: tool, moduleId: 1 }], true, writeItem);

    expect(report.failed).toBe(1);
    expect(report.failures).toEqual([{ itemId: "live:1:1", reason: "Canvas returned 422" }]);
    expect(note.kind).toBe("error");
  });

  it("classifies every item in a mixed selection independently: ineligible, unchanged, updated, and failed can all occur in one run", async () => {
    const writeItem = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ error: "boom" });
    const items = [
      { item: item(1, { type: "Assignment", newTab: null }), moduleId: 1 },
      { item: item(2, { type: "ExternalUrl", newTab: true }), moduleId: 1 },
      { item: item(3, { type: "ExternalUrl", newTab: false }), moduleId: 1 },
      { item: item(4, { type: "ExternalTool", newTab: false }), moduleId: 1 },
    ];

    const { report } = await runBulkNewTabAction(items, true, writeItem);

    expect(writeItem).toHaveBeenCalledTimes(2);
    expect(report.ineligible).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(report.updated).toBe(1);
    expect(report.failed).toBe(1);
  });

  it("requesting 'open in the same tab' (false) writes an eligible item currently true, and leaves one already false alone", async () => {
    const writeItem = vi.fn().mockResolvedValue({ ok: true });
    const items = [
      { item: item(1, { type: "ExternalUrl", newTab: true }), moduleId: 1 },
      { item: item(2, { type: "ExternalUrl", newTab: false }), moduleId: 1 },
    ];

    const { report } = await runBulkNewTabAction(items, false, writeItem);

    expect(writeItem).toHaveBeenCalledTimes(1);
    expect(writeItem).toHaveBeenCalledWith(items[0].item, 1, false);
    expect(report.updated).toBe(1);
    expect(report.unchanged).toBe(1);
  });

  it("returns an empty-selection report ('0 of 0') without calling writeItem", async () => {
    const writeItem = vi.fn();

    const { report, note } = await runBulkNewTabAction([], true, writeItem);

    expect(writeItem).not.toHaveBeenCalled();
    expect(report.updated).toBe(0);
    expect(note.kind).toBe("success");
  });
});
