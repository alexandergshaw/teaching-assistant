// Direct tests for the pure planning cores extracted out of
// useBulkItemActions.ts's "Shift up/down" and "Move to module" controls (see
// ./bulkItemModulePlacementPlan.ts's own header for why they moved). Neither
// function was independently testable before the move - useBulkItemActions
// is a stateful hook (useState/async) that this repo's node-env vitest
// cannot render, so this position math was previously exercised only by
// hand or via a JSX-onClick wiring test that never runs the arithmetic
// itself.
import { describe, expect, it } from "vitest";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { planModuleShiftMoves, planMoveToModulePositions } from "./bulkItemModulePlacementPlan";

function item(id: number, moduleId: number): CanvasModuleItem {
  return {
    id,
    moduleId,
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
  };
}

function mod(id: number, itemCount: number): CanvasModule {
  const items = Array.from({ length: itemCount }, (_, i) => item(id * 100 + i, id));
  return {
    id,
    name: `Module ${id}`,
    position: id,
    published: true,
    itemsCount: items.length,
    items,
  };
}

describe("planModuleShiftMoves", () => {
  it("moves an item one module down, appending it to the end of the target", () => {
    const modules = [mod(1, 0), mod(2, 2), mod(3, 0)];
    const items = [{ item: item(1, 1), moduleId: 1 }];
    const plan = planModuleShiftMoves(items, modules, 1);
    expect(plan.get(1)).toEqual({ srcModuleId: 1, targetModuleId: 2, position: 3 });
  });

  it("clamps the target at the last module, excluding an item already there", () => {
    const modules = [mod(1, 0), mod(2, 0)];
    const items = [{ item: item(1, 2), moduleId: 2 }];
    const plan = planModuleShiftMoves(items, modules, 1);
    expect(plan.has(1)).toBe(false);
  });

  it("clamps the target at the first module, excluding an item already there", () => {
    const modules = [mod(1, 0), mod(2, 0)];
    const items = [{ item: item(1, 1), moduleId: 1 }];
    const plan = planModuleShiftMoves(items, modules, -1);
    expect(plan.has(1)).toBe(false);
  });

  it("preserves selection order when several items land in the same target module", () => {
    const modules = [mod(1, 0), mod(2, 1)];
    const items = [
      { item: item(1, 1), moduleId: 1 },
      { item: item(2, 1), moduleId: 1 },
    ];
    const plan = planModuleShiftMoves(items, modules, 1);
    expect(plan.get(1)?.position).toBe(2);
    expect(plan.get(2)?.position).toBe(3);
  });

  it("skips an item whose current module is not in the module list", () => {
    const modules = [mod(1, 0)];
    const items = [{ item: item(1, 999), moduleId: 999 }];
    const plan = planModuleShiftMoves(items, modules, 1);
    expect(plan.size).toBe(0);
  });
});

describe("planMoveToModulePositions", () => {
  it("appends a moved item after the target's existing items", () => {
    const items = [{ item: item(1, 5), moduleId: 5 }];
    const plan = planMoveToModulePositions(items, 10, 3);
    expect(plan.get(1)).toBe(4);
  });

  it("excludes an item already in the target module", () => {
    const items = [{ item: item(1, 10), moduleId: 10 }];
    const plan = planMoveToModulePositions(items, 10, 3);
    expect(plan.has(1)).toBe(false);
  });

  it("preserves selection order for several items moving into the same target", () => {
    const items = [
      { item: item(1, 5), moduleId: 5 },
      { item: item(2, 6), moduleId: 6 },
    ];
    const plan = planMoveToModulePositions(items, 10, 0);
    expect(plan.get(1)).toBe(1);
    expect(plan.get(2)).toBe(2);
  });
});
