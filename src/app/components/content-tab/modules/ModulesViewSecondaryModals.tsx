"use client";

import type { RefObject } from "react";
import type { CanvasModule } from "@/lib/canvas-modules";
import FilePreviewModal from "../../FilePreviewModal";
import { AssignmentPreviewModal } from "../AssignmentPreviewModal";
import { BulkCreateModulesModal } from "../BulkCreateModulesModal";
import { BulkQuestionsModal } from "../BulkQuestionsModal";
import { BulkUploadModal } from "../BulkUploadModal";
import { GradableEditorModal } from "../GradableEditorModal";
import { OfficeEditorModal } from "../OfficeEditorModal";
import { RenameModulesModal } from "../RenameModulesModal";
import { RubricBuilderModal } from "../RubricBuilderModal";
import { SchedulerModal } from "../SchedulerModal";
import { CarryModulePatternReviewModal } from "./CarryModulePatternReviewModal";
import { CartridgeToCanvasModal } from "./CartridgeToCanvasModal";
import type { UseBulkItemActionsReturn } from "./useBulkItemActions";
import type { UseBulkModuleActionsReturn } from "./useBulkModuleActions";
import type { UseCarryModulePatternReturn } from "./useCarryModulePattern";
import type { UseCartridgeToCanvasReturn } from "./useCartridgeToCanvas";
import type { UseModulesViewDialogsReturn } from "./useModulesViewDialogs";
import type { UseRubricsReturn } from "./useRubrics";

export interface ModulesViewSecondaryModalsProps {
  courseUrl: string;
  acronym?: string;
  courseName?: string;
  modules: CanvasModule[];
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
  reload: () => void;
  dialogs: UseModulesViewDialogsReturn;
  rubricsHook: UseRubricsReturn;
  bulkModuleActions: UseBulkModuleActionsReturn;
  bulkItemActions: UseBulkItemActionsReturn;
  /** AC15 (docs/modules-cartridge-import-upload-acceptance-criteria.md): the
   * "Upload to Canvas" modal - state lives in ModulesView.tsx (the hook
   * instance), open/close boolean + trigger ref live there too (this dialog
   * is NOT part of useModulesViewDialogs.ts, which a concurrent chunk owns),
   * this component only renders it in the one place a modal may render from
   * (AC6/AC15 - never the sticky header). */
  cartridgeUploadOpen: boolean;
  cartridgeUpload: UseCartridgeToCanvasReturn;
  cartridgeUploadTriggerRef: RefObject<HTMLElement | null>;
  onCloseCartridgeUpload: () => void;
  /** "Carry pattern forward" review modal (docs/carry-module-pattern-
   * forward-acceptance-criteria.md, chunk D, D19) - renders at ModulesView
   * root, same as every other modal in this file, rather than inside the
   * bulk bar that opens it (see CarryModulePatternReviewModal.tsx's own
   * header comment for why the bar cannot host it). */
  carryModulePattern: UseCarryModulePatternReturn;
  carryReviewTriggerRef: RefObject<HTMLElement | null>;
}

/**
 * Every dialog `ModulesView` opens OTHER than the generated-content preview
 * modal (GeneratedPreviewModal stays rendered directly from ModulesView.tsx
 * - see generatedPreviewModal.wiring.test.ts, which reads that file's source
 * text and would stop guarding anything if the render site moved).
 *
 * Extracted structurally out of ModulesView.tsx (which was over this repo's
 * 1000-line ceiling) - no behaviour changed, only moved. Every prop below is
 * bound by name, exactly as it was at the original render site.
 */
export function ModulesViewSecondaryModals({
  courseUrl,
  acronym,
  courseName,
  modules,
  setNote,
  reload,
  dialogs,
  rubricsHook,
  bulkModuleActions,
  bulkItemActions,
  cartridgeUploadOpen,
  cartridgeUpload,
  cartridgeUploadTriggerRef,
  onCloseCartridgeUpload,
  carryModulePattern,
  carryReviewTriggerRef,
}: ModulesViewSecondaryModalsProps) {
  return (
    <>
      {carryModulePattern.reviewVisible && carryModulePattern.template && carryModulePattern.plan && (
        <CarryModulePatternReviewModal
          template={carryModulePattern.template}
          plan={carryModulePattern.plan}
          reviewRows={carryModulePattern.reviewRows}
          checkpointRefusedItems={carryModulePattern.checkpointRefusedItems}
          excludedItemIds={carryModulePattern.excludedItemIds}
          onToggleExcludedItem={carryModulePattern.onToggleExcludedItem}
          authoredPatterns={carryModulePattern.authoredPatterns}
          onAuthoredPatternChange={carryModulePattern.onAuthoredPatternChange}
          applyBusy={carryModulePattern.applyBusy}
          onApply={carryModulePattern.onApply}
          onClose={carryModulePattern.closeReview}
          restoreFocusRef={carryReviewTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {cartridgeUploadOpen && (
        <CartridgeToCanvasModal
          cartridge={cartridgeUpload}
          courseName={courseName}
          onClose={onCloseCartridgeUpload}
          restoreFocusRef={cartridgeUploadTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {dialogs.scheduleOpen && (
        <SchedulerModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => dialogs.setScheduleOpen(false)}
          onApplied={(message) => {
            dialogs.setScheduleOpen(false);
            setNote({ kind: "success", text: message });
          }}
          restoreFocusRef={dialogs.schedulerTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {dialogs.bulkUploadOpen && (
        <BulkUploadModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => dialogs.setBulkUploadOpen(false)}
          onDone={reload}
          restoreFocusRef={dialogs.bulkUploadTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {dialogs.bulkCreateOpen && (
        <BulkCreateModulesModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => dialogs.setBulkCreateOpen(false)}
          onApplied={(message) => {
            dialogs.setBulkCreateOpen(false);
            setNote({ kind: "success", text: message });
            reload();
          }}
          restoreFocusRef={dialogs.bulkCreateTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {dialogs.renameOpen && (
        <RenameModulesModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => dialogs.setRenameOpen(false)}
          onApplied={(message) => {
            dialogs.setRenameOpen(false);
            setNote({ kind: "success", text: message });
            reload();
          }}
          restoreFocusRef={dialogs.renameTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {bulkModuleActions.bulkQuestionsOpen && (
        <BulkQuestionsModal
          questions={bulkModuleActions.bulkAddQuestions}
          setQuestions={bulkModuleActions.setBulkAddQuestions}
          onClose={() => bulkModuleActions.setBulkQuestionsOpen(false)}
          restoreFocusRef={dialogs.moduleQuestionsTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {bulkItemActions.bulkItemsQuestionsOpen && (
        <BulkQuestionsModal
          questions={bulkItemActions.bulkItemsQuestions}
          setQuestions={bulkItemActions.setBulkItemsQuestions}
          onClose={() => bulkItemActions.setBulkItemsQuestionsOpen(false)}
          restoreFocusRef={dialogs.itemQuestionsTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {dialogs.editingItem && (
        <GradableEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          item={dialogs.editingItem}
          onClose={() => dialogs.setEditingItem(null)}
          onSaved={reload}
          restoreFocusRef={dialogs.gradableEditorTriggerRef}
          fallbackFocusRefs={[dialogs.modulesListFallbackRef, dialogs.headerFallbackRef]}
        />
      )}

      {dialogs.filePreview && (
        <FilePreviewModal
          selectedPreview={dialogs.filePreview.file}
          previewBlobUrl={dialogs.filePreview.blobUrl}
          onClose={dialogs.closeFilePreview}
          restoreFocusRef={dialogs.filePreviewTriggerRef}
          fallbackFocusRefs={[dialogs.modulesListFallbackRef]}
        />
      )}

      {dialogs.editingFile && dialogs.editingFile.contentId != null && (
        <OfficeEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          fileId={dialogs.editingFile.contentId}
          fileName={dialogs.editingFile.title}
          onClose={() => dialogs.setEditingFile(null)}
          onSaved={() => setNote({ kind: "success", text: "Saved to Canvas." })}
          restoreFocusRef={dialogs.officeEditorTriggerRef}
          fallbackFocusRefs={[dialogs.modulesListFallbackRef]}
        />
      )}

      {rubricsHook.rubricBuilder && (
        <RubricBuilderModal
          courseUrl={courseUrl}
          acronym={acronym}
          assignments={rubricsHook.rubricBuilder.assignments}
          rubricId={rubricsHook.rubricBuilder.editRubricId}
          onClose={() => rubricsHook.setRubricBuilder(null)}
          onCreated={(title, associated) => {
            const editing = rubricsHook.rubricBuilder?.editRubricId != null;
            rubricsHook.setRubricBuilder(null);
            void rubricsHook.refreshRubrics();
            setNote({
              kind: "success",
              text: editing
                ? `Updated rubric "${title}".`
                : associated > 0
                  ? `Created "${title}" and associated it with ${associated} assignment${associated === 1 ? "" : "s"}.`
                  : `Created rubric "${title}".`,
            });
          }}
          restoreFocusRef={dialogs.rubricBuilderTriggerRef}
          fallbackFocusRefs={[dialogs.headerFallbackRef]}
        />
      )}

      {dialogs.previewAssignment && (
        <AssignmentPreviewModal
          courseUrl={courseUrl}
          acronym={acronym}
          item={dialogs.previewAssignment}
          onClose={() => dialogs.setPreviewAssignment(null)}
          restoreFocusRef={dialogs.previewAssignmentTriggerRef}
          fallbackFocusRefs={[dialogs.modulesListFallbackRef]}
        />
      )}
    </>
  );
}
