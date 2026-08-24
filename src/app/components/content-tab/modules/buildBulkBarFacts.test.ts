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

interface LmsPostShape {
  preview?: unknown;
  offersPost?: boolean;
  postUnavailableReason?: string | null;
}

function fakeLmsGeneration(post: LmsPostShape = {}): UseLmsGenerationReturn {
  return {
    kinds: [],
    hasDiagLog: false,
    preview: post.preview ?? null,
    offersPost: post.offersPost ?? false,
    postUnavailableReason: post.postUnavailableReason ?? null,
  } as unknown as UseLmsGenerationReturn;
}

function fakeVisualizerCoverage(): UseVisualizerCoverageReturn {
  return { coverage: null } as unknown as UseVisualizerCoverageReturn;
}

function buildFacts(
  carryReviewOpen: boolean,
  selectionOverrides: { moduleCount?: number; itemCount?: number } = {},
  post: LmsPostShape = {},
) {
  return buildBulkBarFacts({
    selection: fakeSelection(selectionOverrides),
    bulkItemActions: fakeBulkItemActions(),
    bulkModuleActions: fakeBulkModuleActions(),
    rubricsHook: fakeRubricsHook(),
    lmsGeneration: fakeLmsGeneration(post),
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

// generatePostReachable closes the hole carryPatternGroup's own header
// recorded as SHIPPED in the Generate group: "Post to Canvas" lives in
// GeneratedPreviewModal.tsx and was declared nowhere, so groupTier could not
// see it. Unlike carryReviewOpen this fact is DERIVED here rather than passed
// in, because all three inputs are already on the lmsGeneration hook - so
// there is no seam for a caller to get wrong. These tests pin all three
// conditions independently: dropping any one of them from the derivation
// makes the fact OVER-report, which would force the group open and show a
// consequence tag for a write that is not on screen.
describe("buildBulkBarFacts: generatePostReachable is the conjunction of all three conditions", () => {
  const open = { preview: { kind: "assignments" }, offersPost: true, postUnavailableReason: null };

  it("is true only when the modal is mounted, the kind offers a post, and nothing makes it unavailable", () => {
    expect(buildFacts(false, {}, open).generatePostReachable).toBe(true);
  });

  it("is false when no preview is open, even for a kind that offers a post", () => {
    expect(buildFacts(false, {}, { ...open, preview: null }).generatePostReachable).toBe(false);
  });

  it("is false for a preview whose kind offers no post at all - a deck or a script", () => {
    expect(buildFacts(false, {}, { ...open, offersPost: false }).generatePostReachable).toBe(false);
  });

  it("is false when a postUnavailableReason replaces the button with a hint", () => {
    // GeneratedPreviewModal renders the reason INSTEAD of the button, so
    // nothing clickable exists - an export selection with no live Canvas
    // connection is the shipped case.
    const gated = { ...open, postUnavailableReason: "This selection came from an export, not a live Canvas course." };
    expect(buildFacts(false, {}, gated).generatePostReachable).toBe(false);
  });

  it("is independent of carryReviewOpen - the two modal facts do not leak into each other", () => {
    expect(buildFacts(true, {}, { ...open, preview: null }).generatePostReachable).toBe(false);
    expect(buildFacts(false, {}, open).carryReviewOpen).toBe(false);
  });
});
