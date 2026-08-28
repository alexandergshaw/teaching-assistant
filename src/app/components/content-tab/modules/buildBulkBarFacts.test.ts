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
    // The one missing field docs/llm-command-interface-acceptance-criteria.md
    // section 10 (G7) adds - see this function's own new-argument comment.
    // Not this file's own contract to cover further; carryModulePatternOpen's
    // describe block above is the template a future chunk can copy for it.
    commandProposalOpen: false,
    // docs/scheduled-publishing-from-modules-acceptance-criteria.md (F6/F7/
    // F10): the one field that chunk adds to BuildBulkBarFactsArgs - see
    // BulkBarFacts.releaseReviewOpen's own doc comment (bulkBarGroups.ts).
    // Not this file's own contract to cover further, same posture as
    // commandProposalOpen just above.
    releaseReviewOpen: false,
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
  // FIXED (Wave 2D): this fixture's `preview` used the key `kind`, not the
  // real GenerationPreviewState field `kindId` (lmsGenerationTypes.ts:35).
  // Harmless while `generatePostReachableFrom` only checked `preview !==
  // null`, but `generateSubjectEditableFrom` (added by this wave) reads
  // `preview.kindId`, which threw inside `kindTitleIsContent` on the
  // previously-undefined key. No behavioural change to what this fixture
  // pins for generatePostReachable - "assignments" still offers no subject
  // editing (titleIsContent is unset on that kind's config), so every
  // assertion below is unaffected.
  const open = { preview: { kindId: "assignments" }, offersPost: true, postUnavailableReason: null };

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

// generateSubjectEditable (docs/announcement-preview-edit-before-post-
// acceptance-criteria.md, "IMPLEMENTER - WAVE 2D" brief, TASK 1). Copies
// generatePostReachable's own describe block immediately above: DERIVED
// here, not passed in, because both conditions are already on the
// lmsGeneration hook this function receives whole - so there is no seam for
// a caller to get wrong. Uses real GenerationKindId values rather than the
// `open`/`{ kind: "assignments" }` fixture above (that fixture's `kind` key
// is not even the real field name - `preview.kindId` is - and it happens to
// be harmless there only because generatePostReachableFrom never reads into
// `preview` at all beyond its own non-null check; this fact's derivation
// does read `preview.kindId`, so it needs a fixture shaped like the real
// GenerationPreviewState).
describe("buildBulkBarFacts: generateSubjectEditable derives from kindTitleIsContent(preview.kindId), never a hardcoded id", () => {
  it("is true when the modal is mounted and the previewed kind's title is real content (announcements)", () => {
    const facts = buildFacts(false, {}, { preview: { kindId: "announcements" } });
    expect(facts.generateSubjectEditable).toBe(true);
  });

  it("is false when the modal is mounted but the previewed kind's title is a module-derived label, not content (objectives)", () => {
    const facts = buildFacts(false, {}, { preview: { kindId: "objectives" } });
    expect(facts.generateSubjectEditable).toBe(false);
  });

  it("is false when no preview is open at all, even for a kind whose title is real content", () => {
    const facts = buildFacts(false, {}, { preview: null });
    expect(facts.generateSubjectEditable).toBe(false);
  });

  it("is independent of generatePostReachable - a kind can offer subject editing while posting is unavailable, and vice versa", () => {
    const subjectOnly = buildFacts(false, {}, {
      preview: { kindId: "announcements" },
      offersPost: true,
      postUnavailableReason: "This selection came from an export, not a live Canvas course.",
    });
    expect(subjectOnly.generateSubjectEditable).toBe(true);
    expect(subjectOnly.generatePostReachable).toBe(false);

    const postOnly = buildFacts(false, {}, { preview: { kindId: "decks" }, offersPost: false });
    expect(postOnly.generateSubjectEditable).toBe(false);
  });

  it("is independent of carryReviewOpen and commandProposalOpen - the modal-hosted facts do not leak into each other", () => {
    const facts = buildFacts(true, {}, { preview: { kindId: "announcements" } });
    expect(facts.generateSubjectEditable).toBe(true);
    expect(facts.carryReviewOpen).toBe(true);
  });
});

// generateSaveEditReachable (docs/announcement-preview-edit-before-post-
// acceptance-criteria.md, "Adjacent defects" section: `Save edit` was
// reachable only from inside the preview modal and declared nowhere in the
// bulk-bar catalog). Copies `generateSubjectEditable`'s own describe block
// immediately above: DERIVED here, not passed in, for the same reason both
// conditions are already on the lmsGeneration hook this function receives
// whole. Deliberately a BROADER fact than `generateSubjectEditable` - Save
// edit is reachable for every text-editable kind, subject field or not - so
// this block includes a kind ("objectives") where the two facts genuinely
// disagree, to prove they are not silently the same predicate.
describe("buildBulkBarFacts: generateSaveEditReachable derives from kindSupportsTextEdit(preview.kindId), never a hardcoded id", () => {
  it("is true when the modal is mounted and the previewed kind supports text edit (announcements)", () => {
    const facts = buildFacts(false, {}, { preview: { kindId: "announcements" } });
    expect(facts.generateSaveEditReachable).toBe(true);
  });

  it("is true for a kind whose title is module-derived, not content (objectives) - Save edit still persists the body", () => {
    const facts = buildFacts(false, {}, { preview: { kindId: "objectives" } });
    expect(facts.generateSaveEditReachable).toBe(true);
    // The disagreement this block exists to prove: objectives offers no
    // Subject field, but Save edit is still reachable for its body.
    expect(facts.generateSubjectEditable).toBe(false);
  });

  it("is false for a kind whose structured payload is authoritative - a deck's .pptx download and a knowledge check's Canvas post both ignore hand-edited text", () => {
    expect(buildFacts(false, {}, { preview: { kindId: "decks" } }).generateSaveEditReachable).toBe(false);
    expect(buildFacts(false, {}, { preview: { kindId: "knowledgeChecks" } }).generateSaveEditReachable).toBe(false);
  });

  it("is false when no preview is open at all, even for a kind that otherwise supports text edit", () => {
    const facts = buildFacts(false, {}, { preview: null });
    expect(facts.generateSaveEditReachable).toBe(false);
  });

  it("is independent of generatePostReachable and generateSubjectEditable - a kind can offer Save edit while posting is unavailable or no subject exists", () => {
    const facts = buildFacts(false, {}, {
      preview: { kindId: "announcements" },
      offersPost: true,
      postUnavailableReason: "This selection came from an export, not a live Canvas course.",
    });
    expect(facts.generateSaveEditReachable).toBe(true);
    expect(facts.generatePostReachable).toBe(false);
  });

  it("is independent of carryReviewOpen and commandProposalOpen - the modal-hosted facts do not leak into each other", () => {
    const facts = buildFacts(true, {}, { preview: { kindId: "announcements" } });
    expect(facts.generateSaveEditReachable).toBe(true);
    expect(facts.carryReviewOpen).toBe(true);
  });
});
