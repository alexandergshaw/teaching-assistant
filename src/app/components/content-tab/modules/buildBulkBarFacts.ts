import { conceptsForCreate } from "./useVisualizerCoverage";
import type { UseVisualizerCoverageReturn } from "./useVisualizerCoverage";
import type { UseModuleSelectionReturn } from "./useModuleSelection";
import type { UseBulkItemActionsReturn } from "./useBulkItemActions";
import type { UseBulkModuleActionsReturn } from "./useBulkModuleActions";
import type { UseRubricsReturn } from "./useRubrics";
import type { UseLmsGenerationReturn } from "./lmsGenerationTypes";
import type { BulkBarFacts } from "./bulkBarGroups";

export interface BuildBulkBarFactsArgs {
  selection: UseModuleSelectionReturn;
  bulkItemActions: UseBulkItemActionsReturn;
  bulkModuleActions: UseBulkModuleActionsReturn;
  rubricsHook: UseRubricsReturn;
  lmsGeneration: UseLmsGenerationReturn;
  visualizerCoverage: UseVisualizerCoverageReturn;
  /** Whether the "carry pattern forward" review modal is currently open
   * (docs/carry-module-pattern-forward-acceptance-criteria.md, chunk D,
   * D17/D19) - a plain boolean rather than a wrapped hook-return type,
   * because unlike this function's other arguments it names exactly one
   * fact and nothing else this file needs from whatever owns that modal's
   * open/closed state. See BulkBarFacts.carryReviewOpen's own doc comment
   * (bulkBarGroups.ts) for why this fact exists at all: it is what lets
   * `carryApplyButton` - the fan-out write living inside that modal, not in
   * the bar - be a correctly-gated member of `groupTier`'s reduction. */
  carryReviewOpen: boolean;
}

/**
 * Whether "Post to Canvas" inside GeneratedPreviewModal is reachable right
 * now. Derived HERE rather than taken as a caller-supplied boolean (unlike
 * `carryReviewOpen` above) because every input is already on the
 * `lmsGeneration` hook this function receives whole - so there is no seam for
 * a caller to get wrong, and the three conditions cannot drift apart from the
 * modal's own render by being restated at a call site. See
 * BulkBarFacts.generatePostReachable for why it is three conditions and not
 * one.
 */
function generatePostReachableFrom(lmsGeneration: UseLmsGenerationReturn): boolean {
  return (
    lmsGeneration.preview !== null &&
    lmsGeneration.offersPost &&
    !lmsGeneration.postUnavailableReason
  );
}

/**
 * Builds the bulk bar's own consequence/visibility facts (BulkBarFacts,
 * docs/bulk-bar-reorganization-acceptance-criteria.md section 3b/D1) from
 * state ModulesView already holds. Extracted structurally out of
 * ModulesView.tsx (which was over this repo's 1000-line ceiling once this
 * chunk's wiring landed) - the same "pure object-builder, not a hook" move
 * buildModuleCardProps.ts's own header describes for the same reason. Every
 * field maps onto something ModulesView was already computing or storing -
 * see bulkBarGroups.ts's own field-by-field doc comments for what each one
 * gates.
 */
export function buildBulkBarFacts({
  selection,
  bulkItemActions,
  bulkModuleActions,
  rubricsHook,
  lmsGeneration,
  visualizerCoverage,
  carryReviewOpen,
}: BuildBulkBarFactsArgs): BulkBarFacts {
  // BulkItemsSection's own single-item branch (AC11/D1's
  // singleItemEditKind): "gradable" for a single Assignment/Quiz/Discussion
  // with a contentId (offers "Edit in detail"), "page" for a single Page
  // with a pageUrl (offers "Edit page"), "none" otherwise - mirrors the
  // branch BulkItemsSection.tsx's own render still carries.
  const singleItemEditKind: BulkBarFacts["singleItemEditKind"] = (() => {
    const items = selection.selectedItems();
    if (items.length !== 1) return "none";
    const soleItem = items[0].item;
    if (["Assignment", "Quiz", "Discussion"].includes(soleItem.type) && soleItem.contentId != null) return "gradable";
    if (soleItem.type === "Page" && soleItem.pageUrl) return "page";
    return "none";
  })();

  return {
    moduleCount: selection.selectedModules.size,
    itemCount: selection.selected.size,
    selectedAssignmentCount: bulkItemActions.selectedAssignmentCount(),
    singleItemEditKind,
    bulkAddType: bulkModuleActions.bulkAddType,
    bulkAddFileContentPresent: bulkModuleActions.bulkAddFileContent.trim() !== "",
    bulkAddQuestionsCount: bulkModuleActions.bulkAddQuestions.length,
    bulkItemsQuestionsCount: bulkItemActions.bulkItemsQuestions.length,
    rubricsCount: rubricsHook.rubrics.length,
    offersDeck: lmsGeneration.kinds.some((k) => k.id === "decks"),
    offersScript: lmsGeneration.kinds.some((k) => k.id === "scripts"),
    offersIntroDiscussion: lmsGeneration.kinds.some((k) => k.id === "introDiscussion"),
    generationKindsCount: lmsGeneration.kinds.length,
    hasDiagLog: lmsGeneration.hasDiagLog,
    coverageScanned: visualizerCoverage.coverage !== null,
    coveredCount: visualizerCoverage.coverage?.covered.length ?? 0,
    creatableGapsCount: visualizerCoverage.coverage ? conceptsForCreate(visualizerCoverage.coverage).length : 0,
    carryReviewOpen,
    generatePostReachable: generatePostReachableFrom(lmsGeneration),
  };
}
