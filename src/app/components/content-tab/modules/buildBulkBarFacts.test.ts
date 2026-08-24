// Tests for buildBulkBarFacts.ts - previously untested (buildBulkBarFacts
// had zero coverage of its own before docs/carry-module-pattern-forward-
// acceptance-criteria.md, chunk D, added a new REQUIRED argument,
// carryReviewOpen). This file does not attempt to re-cover every pre-
// existing field this function maps (that is a pre-existing gap, out of
// this chunk's own scope) - it pins the one new contract this chunk adds:
// carryReviewOpen threads straight through onto BulkBarFacts unchanged, plus
// a couple of baseline fields so a broken mock below would be caught rather
// than silently producing NaN/undefined everywhere.
//
// Node-env, no component rendered (vitest.config.ts). Each hook-return
// argument is a minimal fake carrying only the fields buildBulkBarFacts.ts
// actually reads, cast through `as unknown as <ReturnType>` rather than
// implementing every method/property those hook interfaces declare - the
// same idiom this suite's sibling wiring tests use for hook-shaped fakes.

import { describe, expect, it } from "vitest";
import { buildBulkBarFacts } from "./buildBulkBarFacts";
import type { UseModuleSelectionReturn } from "./useModuleSelection";
import type { UseBulkItemActionsReturn } from "./useBulkItemActions";
import type { UseBulkModuleActionsReturn } from "./useBulkModuleActions";
import type { UseRubricsReturn } from "./useRubrics";
import type { UseLmsGenerationReturn } from "./lmsGenerationTypes";
import type { UseVisualizerCoverageReturn } from "./useVisualizerCoverage";

function fakeSelection(overrides: { moduleCount?: number; itemCount?: number } = {}): UseModuleSelectionReturn {
  return {
    selected: new Set(Array.from({ length: overrides.itemCount ?? 0 }, (_, i) => `live:1:${i}`)),
    selectedModules: new Set(Array.from({ length: overrides.moduleCount ?? 0 }, (_, i) => `live:${i}`)),
    selectedItems: () => [],
  } as unknown as UseModuleSelectionReturn;
}

function fakeBulkItemActions(): UseBulkItemActionsReturn {
  return {
    selectedAssignmentCount: () => 0,
    bulkItemsQuestions: [],
  } as unknown as UseBulkItemActionsReturn;
}

function fakeBulkModuleActions(): UseBulkModuleActionsReturn {
  return {
    bulkAddType: "Assignment",
    bulkAddFileContent: "",
    bulkAddQuestions: [],
  } as unknown as UseBulkModuleActionsReturn;
}

function fakeRubricsHook(): UseRubricsReturn {
  return { rubrics: [] } as unknown as UseRubricsReturn;
}

function fakeLmsGeneration(): UseLmsGenerationReturn {
  return { kinds: [], hasDiagLog: false } as unknown as UseLmsGenerationReturn;
}

function fakeVisualizerCoverage(): UseVisualizerCoverageReturn {
  return { coverage: null } as unknown as UseVisualizerCoverageReturn;
}

function buildFacts(carryReviewOpen: boolean, selectionOverrides: { moduleCount?: number; itemCount?: number } = {}) {
  return buildBulkBarFacts({
    selection: fakeSelection(selectionOverrides),
    bulkItemActions: fakeBulkItemActions(),
    bulkModuleActions: fakeBulkModuleActions(),
    rubricsHook: fakeRubricsHook(),
    lmsGeneration: fakeLmsGeneration(),
    visualizerCoverage: fakeVisualizerCoverage(),
    carryReviewOpen,
  });
}

describe("buildBulkBarFacts: carryReviewOpen (docs/carry-module-pattern-forward-acceptance-criteria.md, chunk D, D17)", () => {
  it("threads carryReviewOpen: false straight through onto BulkBarFacts", () => {
    const facts = buildFacts(false);
    expect(facts.carryReviewOpen).toBe(false);
  });

  it("threads carryReviewOpen: true straight through onto BulkBarFacts", () => {
    const facts = buildFacts(true);
    expect(facts.carryReviewOpen).toBe(true);
  });

  it("carryReviewOpen is independent of moduleCount - a real regression this function could have (accidentally deriving it instead of passing it through)", () => {
    const closedWithModules = buildFacts(false, { moduleCount: 3 });
    const openWithNoModules = buildFacts(true, { moduleCount: 0 });
    expect(closedWithModules.carryReviewOpen).toBe(false);
    expect(closedWithModules.moduleCount).toBe(3);
    expect(openWithNoModules.carryReviewOpen).toBe(true);
    expect(openWithNoModules.moduleCount).toBe(0);
  });
});

describe("buildBulkBarFacts: baseline field sanity (guards the fakes above, not new behaviour)", () => {
  it("moduleCount and itemCount come from the selection hook's own Set sizes", () => {
    const facts = buildFacts(false, { moduleCount: 2, itemCount: 5 });
    expect(facts.moduleCount).toBe(2);
    expect(facts.itemCount).toBe(5);
  });
});
