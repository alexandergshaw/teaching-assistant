import { describe, expect, it } from "vitest";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import {
  nonLiveModuleKeys,
  pruneSelectionForModules,
  withoutExportItemKey,
  withoutExportModuleKeys,
  withoutItemKey,
  withoutModuleKey,
  withoutModuleKeys,
  withoutRepoItemKey,
  withoutRepoModuleKeys,
  type RepoModuleRefs,
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

// Minimal export-module fixtures - only `identifier` and `items[].identifier`
// matter to the functions under test.
function exportModuleWith(identifier: string, itemIdentifiers: string[]): CartridgeModule {
  return {
    name: `Export ${identifier}`,
    position: 1,
    identifier,
    items: itemIdentifiers.map((id) => ({ title: id, type: "Page", identifier: id })),
  };
}

// Minimal repo-tree fixture - only `ref` and `itemRefs` matter to the
// functions under test (see RepoModuleRefs's own doc comment on
// useModuleSelection.ts for why the shape is this minimal).
function repoModuleWith(ref: string, itemRefs: string[]): RepoModuleRefs {
  return { ref, itemRefs };
}

// Selection keys are itemKey's discriminated "live:<moduleId>:<itemId>"
// strings and liveModuleKey's/exportModuleKey's/repoModuleKey's
// "live:<id>" / "export:<ref>" / "repo:<ref>" strings (see ../utils). These
// fixtures are written in that shape directly (rather than built via the key
// functions) so a future change to their exact templates cannot silently
// rewrite what these tests are asserting.

describe("withoutItemKey", () => {
  it("drops the removed item's key and leaves everything else untouched", () => {
    const selected = new Set(["live:1:10", "live:1:11", "live:2:20"]);
    const next = withoutItemKey(selected, 1, 10);
    expect(next).toEqual(new Set(["live:1:11", "live:2:20"]));
  });

  it("returns the exact same Set reference (no-op) when the key wasn't selected", () => {
    const selected = new Set(["live:1:10"]);
    const next = withoutItemKey(selected, 9, 99);
    expect(next).toBe(selected);
  });
});

describe("withoutExportItemKey", () => {
  it("drops the removed export item's key and leaves everything else untouched", () => {
    const selected = new Set(["export:m1:i1", "export:m1:i2", "export:m2:i1"]);
    const next = withoutExportItemKey(selected, "m1", "i1");
    expect(next).toEqual(new Set(["export:m1:i2", "export:m2:i1"]));
  });

  it("returns the exact same Set reference (no-op) when the key wasn't selected", () => {
    const selected = new Set(["export:m1:i1"]);
    const next = withoutExportItemKey(selected, "other", "other");
    expect(next).toBe(selected);
  });
});

describe("withoutRepoItemKey", () => {
  it("drops the removed repo item's key and leaves everything else untouched", () => {
    const selected = new Set(["repo:assignments/module_01:assignments/module_01/README.md", "repo:assignments/module_01:assignments/module_01/x.md", "repo:assignments/module_02:y.md"]);
    const next = withoutRepoItemKey(selected, "assignments/module_01", "assignments/module_01/README.md");
    expect(next).toEqual(new Set(["repo:assignments/module_01:assignments/module_01/x.md", "repo:assignments/module_02:y.md"]));
  });

  it("returns the exact same Set reference (no-op) when the key wasn't selected", () => {
    const selected = new Set(["repo:m1:i1"]);
    const next = withoutRepoItemKey(selected, "other", "other");
    expect(next).toBe(selected);
  });
});

describe("withoutModuleKey", () => {
  it("drops the removed module's key and leaves other keys untouched, live and export alike", () => {
    const selectedModules = new Set(["live:1", "live:2", "export:m1"]);
    const next = withoutModuleKey(selectedModules, "live:2");
    expect(next).toEqual(new Set(["live:1", "export:m1"]));
  });

  it("drops an export module key without disturbing a live one", () => {
    const selectedModules = new Set(["live:1", "export:m1"]);
    const next = withoutModuleKey(selectedModules, "export:m1");
    expect(next).toEqual(new Set(["live:1"]));
  });

  it("returns the exact same Set reference (no-op) when the key wasn't selected", () => {
    const selectedModules = new Set(["live:1"]);
    const next = withoutModuleKey(selectedModules, "live:99");
    expect(next).toBe(selectedModules);
  });

  it("a live key and an export key that are numerically identical never collide", () => {
    const selectedModules = new Set(["live:1", "export:1"]);
    const next = withoutModuleKey(selectedModules, "live:1");
    expect(next).toEqual(new Set(["export:1"]));
  });
});

describe("withoutModuleKeys", () => {
  it("drops every key belonging to the removed module", () => {
    const selected = new Set(["live:5:1", "live:5:2", "live:6:1"]);
    const next = withoutModuleKeys(selected, 5);
    expect(next).toEqual(new Set(["live:6:1"]));
  });

  it("returns the exact same Set reference (no-op) when the module had no selected keys", () => {
    const selected = new Set(["live:6:1"]);
    const next = withoutModuleKeys(selected, 5);
    expect(next).toBe(selected);
  });

  // The collision this function exists to avoid: keys are "live:${moduleId}:
  // ${itemId}" strings, and module 12's key "live:12:7" starts with the same
  // digit "1" right after the "live:" discriminator - so a naive
  // `key.startsWith("live:" + moduleId)` prune, run for moduleId 1, would
  // also treat module 12's key as belonging to module 1 and drop it. A
  // correct prune matches on "live:1:" (with the trailing separator), which
  // "live:12:7" does not start with, so module 12's key must survive
  // dropping module 1.
  it("does not drop a higher-numbered module's keys when the removed id is a numeric prefix of it", () => {
    const selected = new Set(["live:1:5", "live:12:7"]);
    const next = withoutModuleKeys(selected, 1);
    expect(next).toEqual(new Set(["live:12:7"]));
  });

  // The mirror image: dropping module 12 must not sweep up module 1's key.
  it("does not drop a lower-numbered module's keys when removing a module whose id embeds it", () => {
    const selected = new Set(["live:1:5", "live:12:7"]);
    const next = withoutModuleKeys(selected, 12);
    expect(next).toEqual(new Set(["live:1:5"]));
  });
});

describe("withoutExportModuleKeys", () => {
  it("drops every export item key belonging to the removed export module", () => {
    const selected = new Set(["export:m5:i1", "export:m5:i2", "export:m6:i1"]);
    const next = withoutExportModuleKeys(selected, "m5");
    expect(next).toEqual(new Set(["export:m6:i1"]));
  });

  it("returns the exact same Set reference (no-op) when the export module had no selected keys", () => {
    const selected = new Set(["export:m6:i1"]);
    const next = withoutExportModuleKeys(selected, "m5");
    expect(next).toBe(selected);
  });

  // THE 1-vs-12 COLLISION GUARD, export flavour: export module refs are
  // manifest strings, not guaranteed numeric, but a course export CAN still
  // legitimately use "1" and "12" as its own identifiers - the same
  // trailing-separator guard withoutModuleKeys relies on for live ids must
  // hold here too.
  it("does not drop a higher-ref export module's keys when the removed ref is a string prefix of it", () => {
    const selected = new Set(["export:1:i5", "export:12:i7"]);
    const next = withoutExportModuleKeys(selected, "1");
    expect(next).toEqual(new Set(["export:12:i7"]));
  });

  it("does not drop a lower-ref export module's keys when removing a ref that embeds it", () => {
    const selected = new Set(["export:1:i5", "export:12:i7"]);
    const next = withoutExportModuleKeys(selected, "12");
    expect(next).toEqual(new Set(["export:1:i5"]));
  });
});

describe("withoutRepoModuleKeys", () => {
  it("drops every repo item key belonging to the removed repo module", () => {
    const selected = new Set(["repo:assignments/module_05:i1", "repo:assignments/module_05:i2", "repo:assignments/module_06:i1"]);
    const next = withoutRepoModuleKeys(selected, "assignments/module_05");
    expect(next).toEqual(new Set(["repo:assignments/module_06:i1"]));
  });

  it("returns the exact same Set reference (no-op) when the repo module had no selected keys", () => {
    const selected = new Set(["repo:assignments/module_06:i1"]);
    const next = withoutRepoModuleKeys(selected, "assignments/module_05");
    expect(next).toBe(selected);
  });

  // THE 1-vs-12 COLLISION GUARD, repo flavour: a repo module ref of
  // "assignments/module_1" must not also match "assignments/module_12".
  it("does not drop a higher-ref repo module's keys when the removed ref is a string prefix of it", () => {
    const selected = new Set(["repo:1:i5", "repo:12:i7"]);
    const next = withoutRepoModuleKeys(selected, "1");
    expect(next).toEqual(new Set(["repo:12:i7"]));
  });

  it("does not drop a lower-ref repo module's keys when removing a ref that embeds it", () => {
    const selected = new Set(["repo:1:i5", "repo:12:i7"]);
    const next = withoutRepoModuleKeys(selected, "12");
    expect(next).toEqual(new Set(["repo:1:i5"]));
  });
});

describe("nonLiveModuleKeys", () => {
  // This is the rule setLiveModuleIds's shim relies on to avoid dropping a
  // repo module key on a write that only ever intends to touch the live
  // portion of the selection (useBulkModuleActions.ts's publish/delete/
  // add-to-module) - a repo key is untouched by setLiveModuleIds because
  // this is the function it delegates the "keep everything non-live" half
  // of its rewrite to.
  it("keeps an export key and a repo key untouched, dropping only live keys", () => {
    const keys = new Set(["live:1", "live:2", "export:m1", "repo:assignments/module_01"]);
    const next = nonLiveModuleKeys(keys);
    expect(next).toEqual(new Set(["export:m1", "repo:assignments/module_01"]));
  });

  it("returns an empty Set when every key is live", () => {
    const keys = new Set(["live:1", "live:2"]);
    const next = nonLiveModuleKeys(keys);
    expect(next).toEqual(new Set());
  });
});

describe("pruneSelectionForModules", () => {
  it("drops a deleted item's key but keeps other selected items in the same module", () => {
    const modules = [moduleWith(1, [10]), moduleWith(2, [20])]; // item live:1:11 was deleted
    const selected = new Set(["live:1:10", "live:1:11", "live:2:20"]);
    const selectedModules = new Set<string>();
    const result = pruneSelectionForModules(modules, null, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["live:1:10", "live:2:20"]));
    expect(result.selectedModules).toBe(selectedModules); // untouched, same reference
  });

  it("drops a deleted module's key and every one of its item keys, keeping an unrelated module intact", () => {
    // Module 1 was deleted entirely; module 12 (its numeric prefix collision
    // partner) survives with the same items it always had.
    const modules = [moduleWith(12, [7])];
    const selected = new Set(["live:1:5", "live:12:7"]);
    const selectedModules = new Set(["live:1", "live:12"]);
    const result = pruneSelectionForModules(modules, null, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["live:12:7"]));
    expect(result.selectedModules).toEqual(new Set(["live:12"]));
  });

  it("returns the same Set references when nothing in the selection went stale", () => {
    const modules = [moduleWith(1, [10, 11])];
    const selected = new Set(["live:1:10"]);
    const selectedModules = new Set(["live:1"]);
    const result = pruneSelectionForModules(modules, null, selected, selectedModules);
    expect(result.selected).toBe(selected);
    expect(result.selectedModules).toBe(selectedModules);
  });

  it("clears everything when the module tree belongs to an entirely different course", () => {
    // Simulates a course switch: none of the old selection's ids exist in the
    // newly loaded module tree.
    const oldSelected = new Set(["live:100:1000", "live:100:1001"]);
    const oldSelectedModules = new Set(["live:100"]);
    const newModules = [moduleWith(200, [2000])];
    const result = pruneSelectionForModules(newModules, null, oldSelected, oldSelectedModules);
    expect(result.selected.size).toBe(0);
    expect(result.selectedModules.size).toBe(0);
  });

  it("leaves a stale export-sourced key in place when NO export tree is supplied - nothing to confirm or refute it against", () => {
    const modules = [moduleWith(1, [10])];
    const selected = new Set(["live:1:10", "export:modA:itemA"]);
    const selectedModules = new Set(["export:modA"]);
    const result = pruneSelectionForModules(modules, null, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["live:1:10", "export:modA:itemA"]));
    expect(result.selectedModules).toEqual(new Set(["export:modA"]));
  });

  it("drops a stale export-sourced item key once an export tree is supplied and confirms it's gone", () => {
    // Now that export module/item keys exist (this change), a supplied
    // export tree makes them just as prunable as a live tree always has -
    // the module here (modA) still exists, but itemA was removed from it.
    const modules: CanvasModule[] = [];
    const exportModules = [exportModuleWith("modA", ["itemB"])]; // itemA is gone
    const selected = new Set(["export:modA:itemA", "export:modA:itemB"]);
    const selectedModules = new Set(["export:modA"]);
    const result = pruneSelectionForModules(modules, exportModules, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["export:modA:itemB"]));
    expect(result.selectedModules).toEqual(new Set(["export:modA"])); // the module itself survives
  });

  it("drops a stale export module key (and its item keys) once an export tree confirms it's gone", () => {
    const modules: CanvasModule[] = [];
    const exportModules = [exportModuleWith("modB", ["itemX"])]; // modA no longer exists
    const selected = new Set(["export:modA:itemA", "export:modB:itemX"]);
    const selectedModules = new Set(["export:modA", "export:modB"]);
    const result = pruneSelectionForModules(modules, exportModules, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["export:modB:itemX"]));
    expect(result.selectedModules).toEqual(new Set(["export:modB"]));
  });

  it("an empty (but supplied) export tree confirms every export key stale", () => {
    const modules: CanvasModule[] = [];
    const selected = new Set(["export:modA:itemA"]);
    const selectedModules = new Set(["export:modA"]);
    const result = pruneSelectionForModules(modules, [], selected, selectedModules);
    expect(result.selected.size).toBe(0);
    expect(result.selectedModules.size).toBe(0);
  });

  it("THE 1-vs-12 COLLISION GUARD holds under the new module-key format: pruning live module 1 leaves module 12's keys untouched", () => {
    const modules = [moduleWith(12, [7])];
    const selected = new Set(["live:1:5", "live:12:7"]);
    const selectedModules = new Set(["live:1", "live:12"]);
    const result = pruneSelectionForModules(modules, null, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["live:12:7"]));
    expect(result.selectedModules).toEqual(new Set(["live:12"]));
  });

  it("a live module and an export module that are numerically identical are pruned independently", () => {
    const modules = [moduleWith(1, [5])]; // live module 1 survives
    const exportModules: CartridgeModule[] = []; // export module "1" does not
    const selected = new Set(["live:1:5", "export:1:1"]);
    const selectedModules = new Set(["live:1", "export:1"]);
    const result = pruneSelectionForModules(modules, exportModules, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["live:1:5"]));
    expect(result.selectedModules).toEqual(new Set(["live:1"]));
  });

  // ── Repo-sourced keys (mirrors the export-sourced coverage above) ────────

  it("leaves a stale repo-sourced key in place when NO repo tree is supplied - nothing to confirm or refute it against", () => {
    // This is the rule the sabotage-check in this wave's brief targets: a
    // repo key must NOT be swept just because no repo tree has loaded yet
    // (e.g. the first render before the repo-tree fetch resolves).
    const modules = [moduleWith(1, [10])];
    const selected = new Set(["live:1:10", "repo:assignments/module_01:assignments/module_01/README.md"]);
    const selectedModules = new Set(["repo:assignments/module_01"]);
    const result = pruneSelectionForModules(modules, null, selected, selectedModules);
    expect(result.selected).toEqual(new Set(["live:1:10", "repo:assignments/module_01:assignments/module_01/README.md"]));
    expect(result.selectedModules).toEqual(new Set(["repo:assignments/module_01"]));
  });

  it("drops a stale repo-sourced module key (and its item keys) once a repo tree confirms the folder is gone", () => {
    const modules: CanvasModule[] = [];
    // Only module_02's folder is still in the tree; module_01's is gone.
    const repoModules = [repoModuleWith("assignments/module_02", ["assignments/module_02/README.md"])];
    const selected = new Set([
      "repo:assignments/module_01:assignments/module_01/README.md",
      "repo:assignments/module_02:assignments/module_02/README.md",
    ]);
    const selectedModules = new Set(["repo:assignments/module_01", "repo:assignments/module_02"]);
    const result = pruneSelectionForModules(modules, null, selected, selectedModules, repoModules);
    expect(result.selected).toEqual(new Set(["repo:assignments/module_02:assignments/module_02/README.md"]));
    expect(result.selectedModules).toEqual(new Set(["repo:assignments/module_02"]));
  });

  it("drops a stale repo-sourced item key once a repo tree is supplied and confirms it's gone, keeping its module", () => {
    const modules: CanvasModule[] = [];
    // The folder still exists, but one of its files was removed from the tree.
    const repoModules = [repoModuleWith("assignments/module_01", ["assignments/module_01/README.md"])];
    const selected = new Set([
      "repo:assignments/module_01:assignments/module_01/README.md",
      "repo:assignments/module_01:assignments/module_01/gone.md",
    ]);
    const selectedModules = new Set(["repo:assignments/module_01"]);
    const result = pruneSelectionForModules(modules, null, selected, selectedModules, repoModules);
    expect(result.selected).toEqual(new Set(["repo:assignments/module_01:assignments/module_01/README.md"]));
    expect(result.selectedModules).toEqual(new Set(["repo:assignments/module_01"])); // the module itself survives
  });

  it("an empty (but supplied) repo tree confirms every repo key stale", () => {
    const modules: CanvasModule[] = [];
    const selected = new Set(["repo:assignments/module_01:assignments/module_01/README.md"]);
    const selectedModules = new Set(["repo:assignments/module_01"]);
    const result = pruneSelectionForModules(modules, null, selected, selectedModules, []);
    expect(result.selected.size).toBe(0);
    expect(result.selectedModules.size).toBe(0);
  });

  it("mixed live, export and repo selections prune independently with no cross-contamination", () => {
    // Live module 1 survives; export module "modA" is gone; repo folder
    // module_02 is gone but module_01 survives with one item removed.
    const modules = [moduleWith(1, [10])];
    const exportModules: CartridgeModule[] = []; // modA no longer in the export tree
    const repoModules = [repoModuleWith("assignments/module_01", ["assignments/module_01/README.md"])]; // module_02 gone, module_01's extra item gone
    const selected = new Set([
      "live:1:10",
      "export:modA:itemA",
      "repo:assignments/module_01:assignments/module_01/README.md",
      "repo:assignments/module_01:assignments/module_01/gone.md",
      "repo:assignments/module_02:assignments/module_02/README.md",
    ]);
    const selectedModules = new Set(["live:1", "export:modA", "repo:assignments/module_01", "repo:assignments/module_02"]);
    const result = pruneSelectionForModules(modules, exportModules, selected, selectedModules, repoModules);
    expect(result.selected).toEqual(new Set(["live:1:10", "repo:assignments/module_01:assignments/module_01/README.md"]));
    expect(result.selectedModules).toEqual(new Set(["live:1", "repo:assignments/module_01"]));
  });
});
