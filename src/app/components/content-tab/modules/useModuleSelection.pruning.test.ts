import { describe, expect, it } from "vitest";
import type { CanvasModule } from "@/lib/canvas-modules";
import {
  pruneSelectionForModules,
  withoutItemKey,
  withoutModuleId,
  withoutModuleKeys,
} from "./useModuleSelection";

// Minimal module fixtures. Only `id` and `items[].id` matter to the functions
// under test, so items are cast rather than filling out every CanvasModuleItem
// field.
function moduleWith(id: number, itemIds: number[]): CanvasModule {
  return {
    id,
    items: itemIds.map((itemId) => ({ id: itemId })),
  } as unknown as CanvasModule;
}

describe("withoutItemKey", () => {
  it("drops the removed item's key and leaves everything else untouched", () => {
    const selected = new Set(["1:10", "1:11", "2:20"]);
    const next = withoutItemKey(selected, 1, 10);
    expect(next).toEqual(new Set(["1:11", "2:20"]));
  });

  it("returns the exact same Set reference (no-op) when the key wasn't selected", () => {
    const selected = new Set(["1:10"]);
    const next = withoutItemKey(selected, 9, 99);
    expect(next).toBe(selected);
  });
});

describe("withoutModuleId", () => {
  it("drops the removed module's id and leaves other ids untouched", () => {
    const selectedModules = new Set([1, 2, 12]);
    const next = withoutModuleId(selectedModules, 2);
    expect(next).toEqual(new Set([1, 12]));
  });

  it("returns the exact same Set reference (no-op) when the id wasn't selected", () => {
    const selectedModules = new Set([1]);
    const next = withoutModuleId(selectedModules, 99);
    expect(next).toBe(selectedModules);
  });
});

describe("withoutModuleKeys", () => {
  it("drops every key belonging to the removed module", () => {
    const selected = new Set(["5:1", "5:2", "6:1"]);
    const next = withoutModuleKeys(selected, 5);
    expect(next).toEqual(new Set(["6:1"]));
  });

  it("returns the exact same Set reference (no-op) when the module had no selected keys", () => {
    const selected = new Set(["6:1"]);
    const next = withoutModuleKeys(selected, 5);
    expect(next).toBe(selected);
  });

  // The collision this function exists to avoid: keys are "${moduleId}:${itemId}"
  // strings, and module 12's key "12:7" starts with the digit "1" - so a naive
  // `key.startsWith(String(moduleId))` prune, run for moduleId 1, would also
  // treat module 12's key as belonging to module 1 and drop it. A correct
  // prune matches on "1:" (with the separator), which "12:7" does not start
  // with, so module 12's key must survive dropping module 1.
  it("does not drop a higher-numbered module's keys when the removed id is a numeric prefix of it", () => {
    const selected = new Set(["1:5", "12:7"]);
    const next = withoutModuleKeys(selected, 1);
    expect(next).toEqual(new Set(["12:7"]));
  });

  // The mirror image: dropping module 12 must not sweep up module 1's key.
  it("does not drop a lower-numbered module's keys when removing a module whose id embeds it", () => {
    const selected = new Set(["1:5", "12:7"]);
    const next = withoutModuleKeys(selected, 12);
    expect(next).toEqual(new Set(["1:5"]));
  });
});

describe("pruneSelectionForModules", () => {
  it("drops a deleted item's key but keeps other selected items in the same module", () => {
    const modules = [moduleWith(1, [10]), moduleWith(2, [20])]; // item 1:11 was deleted
    const selected = new Set(["1:10", "1:11", "2:20"]);
    const selectedModules = new Set<number>();
    const result = pruneSelectionForModules(modules, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["1:10", "2:20"]));
    expect(result.selectedModules).toBe(selectedModules); // untouched, same reference
  });

  it("drops a deleted module's id and every one of its item keys, keeping an unrelated module intact", () => {
    // Module 1 was deleted entirely; module 12 (its numeric prefix collision
    // partner) survives with the same items it always had.
    const modules = [moduleWith(12, [7])];
    const selected = new Set(["1:5", "12:7"]);
    const selectedModules = new Set([1, 12]);
    const result = pruneSelectionForModules(modules, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["12:7"]));
    expect(result.selectedModules).toEqual(new Set([12]));
  });

  it("returns the same Set references when nothing in the selection went stale", () => {
    const modules = [moduleWith(1, [10, 11])];
    const selected = new Set(["1:10"]);
    const selectedModules = new Set([1]);
    const result = pruneSelectionForModules(modules, selected, selectedModules);
    expect(result.selected).toBe(selected);
    expect(result.selectedModules).toBe(selectedModules);
  });

  it("clears everything when the module tree belongs to an entirely different course", () => {
    // Simulates a course switch: none of the old selection's ids exist in the
    // newly loaded module tree.
    const oldSelected = new Set(["100:1000", "100:1001"]);
    const oldSelectedModules = new Set([100]);
    const newModules = [moduleWith(200, [2000])];
    const result = pruneSelectionForModules(newModules, oldSelected, oldSelectedModules);
    expect(result.selected.size).toBe(0);
    expect(result.selectedModules.size).toBe(0);
  });
});
