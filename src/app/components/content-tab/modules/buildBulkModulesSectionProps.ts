import type { CanvasAddableContent } from "@/lib/canvas-modules";
import type { ContentSourceContext } from "../contentSourceGating";
import type { BulkModulesSectionProps } from "./BulkModulesSection";
import type { UseBulkModuleActionsReturn } from "./useBulkModuleActions";
import type { UseRubricsReturn } from "./useRubrics";

export interface BuildBulkModulesSectionPropsArgs {
  opBusy: boolean;
  ctx: ContentSourceContext;
  bulkModuleActions: UseBulkModuleActionsReturn;
  targets: CanvasAddableContent | null;
  ensureTargets: () => void;
  rubricsHook: UseRubricsReturn;
  onModuleQuestionsTrigger: (trigger: HTMLElement) => void;
}

/**
 * The `<BulkModulesSection>` prop object (everything except `facts`/
 * `groupsState`, which stay bare identifiers at the render site per
 * docs/current-events-assignment-from-modules-acceptance-criteria.md D8 -
 * bulkBar.wiring.test.ts slices that tag and requires both as literal
 * `name={identifier}` pairs, which a full spread swallowing them would fail).
 * Extracted structurally out of ModulesView.tsx (over this repo's 1000-line
 * ceiling) - a pure object-builder, not a hook, the same move
 * buildBulkBarFacts.ts and buildModuleCardProps.ts already made for their own
 * over-long prop blocks. Every field maps onto something ModulesView already
 * computes or holds; nothing here is new behaviour.
 */
export function buildBulkModulesSectionProps({
  opBusy,
  ctx,
  bulkModuleActions,
  targets,
  ensureTargets,
  rubricsHook,
  onModuleQuestionsTrigger,
}: BuildBulkModulesSectionPropsArgs): Omit<
  BulkModulesSectionProps,
  // Wave 2 (docs/current-events-assignment-from-modules-acceptance-criteria.md,
  // 2C) added three REQUIRED props for the "currentEvents" group, threaded at
  // the render site exactly like facts/groupsState above (per this file's own
  // header comment, which already named this chunk's D8 before those three
  // concrete prop names existed) - excluded here for the same reason, not a
  // change to this function's own logic or argument list.
  //
  // Chunk D (docs/carry-module-pattern-forward-acceptance-criteria.md, D14/
  // D19/D20/D21) adds six more REQUIRED props for the "carryPattern" group,
  // all from a NEW hook (useCarryModulePattern) this function's own argument
  // list does not accept - threaded the same way, as bare identifiers at the
  // ModulesView.tsx render site, for the identical reason.
  | "facts"
  | "groupsState"
  | "confirmCurrentEvents"
  | "currentEventsLabel"
  | "runCurrentEventsAssignments"
  | "carryTemplateOptions"
  | "carrySourceModuleId"
  | "onCarrySourceModuleIdChange"
  | "carryReviewBusy"
  | "onReviewCarryPattern"
  | "onCarryReviewTrigger"
> {
  return {
    opBusy,
    sourceContext: ctx,
    bulkPublishModules: bulkModuleActions.bulkPublishModules,
    bulkDeleteModules: bulkModuleActions.bulkDeleteModules,
    confirmDeleteModules: bulkModuleActions.confirmDeleteModules,
    bulkAddType: bulkModuleActions.bulkAddType,
    setBulkAddType: bulkModuleActions.setBulkAddType,
    bulkAddPattern: bulkModuleActions.bulkAddPattern,
    setBulkAddPattern: bulkModuleActions.setBulkAddPattern,
    bulkAddSubType: bulkModuleActions.bulkAddSubType,
    setBulkAddSubType: bulkModuleActions.setBulkAddSubType,
    bulkAiBusy: bulkModuleActions.bulkAiBusy,
    bulkAddFileContent: bulkModuleActions.bulkAddFileContent,
    setBulkAddFileContent: bulkModuleActions.setBulkAddFileContent,
    bulkAddFileId: bulkModuleActions.bulkAddFileId,
    setBulkAddFileId: bulkModuleActions.setBulkAddFileId,
    bulkAddToModules: bulkModuleActions.bulkAddToModules,
    targets,
    ensureTargets,
    bulkAddFileFormat: bulkModuleActions.bulkAddFileFormat,
    setBulkAddFileFormat: bulkModuleActions.setBulkAddFileFormat,
    bulkFileOptions: bulkModuleActions.bulkFileOptions,
    bulkAddDue: bulkModuleActions.bulkAddDue,
    setBulkAddDue: bulkModuleActions.setBulkAddDue,
    bulkAddStaggerOffset: bulkModuleActions.bulkAddStaggerOffset,
    setBulkAddStaggerOffset: bulkModuleActions.setBulkAddStaggerOffset,
    bulkAddStaggerUnit: bulkModuleActions.bulkAddStaggerUnit,
    setBulkAddStaggerUnit: bulkModuleActions.setBulkAddStaggerUnit,
    bulkAddPoints: bulkModuleActions.bulkAddPoints,
    setBulkAddPoints: bulkModuleActions.setBulkAddPoints,
    bulkAddRubricId: bulkModuleActions.bulkAddRubricId,
    setBulkAddRubricId: bulkModuleActions.setBulkAddRubricId,
    rubrics: rubricsHook.rubrics,
    bulkAddDescription: bulkModuleActions.bulkAddDescription,
    setBulkAddDescription: bulkModuleActions.setBulkAddDescription,
    bulkAddQuestions: bulkModuleActions.bulkAddQuestions,
    setBulkAddQuestions: bulkModuleActions.setBulkAddQuestions,
    setBulkQuestionsOpen: bulkModuleActions.setBulkQuestionsOpen,
    onModuleQuestionsTrigger,
    bulkAiPrompt: bulkModuleActions.bulkAiPrompt,
    setBulkAiPrompt: bulkModuleActions.setBulkAiPrompt,
    bulkAiGenerate: bulkModuleActions.bulkAiGenerate,
  };
}
