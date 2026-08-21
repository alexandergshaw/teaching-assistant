import type { CanvasModuleItem } from "@/lib/canvas-modules";
import type { LlmProvider } from "@/lib/llm";
import type { ContentSourceContext } from "../contentSourceGating";
import type { AddItemRowSharedProps, ModuleItemRowSharedProps } from "./ModuleCard";
import type { ExportAddItemRowSharedProps } from "./ExportAddItemRow";
import type { UseAddModuleItemReturn } from "./useAddModuleItem";
import type { UseDragReorderReturn } from "./useDragReorder";
import type { UseExportModuleAdditionsReturn } from "./useExportModuleAdditions";
import type { UseInlineModuleEditsReturn } from "./useInlineModuleEdits";
import type { UseModuleSelectionReturn } from "./useModuleSelection";
import type { UseVideoRepoPickersReturn } from "./useVideoRepoPickers";

export interface BuildModuleCardPropsArgs {
  busy: boolean;
  ctx: ContentSourceContext;
  provider: LlmProvider;
  dragReorder: UseDragReorderReturn;
  selection: UseModuleSelectionReturn;
  edits: UseInlineModuleEditsReturn;
  onEditPage: (pageUrl: string) => void;
  onPageEditorTrigger: (trigger: HTMLElement) => void;
  setPreviewAssignment: (item: CanvasModuleItem | null) => void;
  setEditingItem: (item: CanvasModuleItem | null) => void;
  openFilePreview: (it: CanvasModuleItem, trigger: HTMLElement) => Promise<void>;
  setEditingFile: (item: CanvasModuleItem | null) => void;
  onPreviewAssignmentTrigger: (trigger: HTMLElement) => void;
  onGradableEditorTrigger: (trigger: HTMLElement) => void;
  onOfficeEditorTrigger: (trigger: HTMLElement) => void;
  exportAdditions: UseExportModuleAdditionsReturn;
  addModuleItem: UseAddModuleItemReturn;
  videoRepo: UseVideoRepoPickersReturn;
}

export interface BuildModuleCardPropsResult {
  itemRowProps: ModuleItemRowSharedProps;
  addItemRowProps: AddItemRowSharedProps;
  exportAdditionsProps: ExportAddItemRowSharedProps;
}

/**
 * Props shared by every item row / "Add item" row / export-addition row, in
 * every module. Extracted structurally out of ModulesView.tsx (which was
 * over this repo's 1000-line ceiling) - a pure object-builder, not a hook
 * (it calls none), so it can live outside the component with no change to
 * what gets built or when.
 */
export function buildModuleCardProps(args: BuildModuleCardPropsArgs): BuildModuleCardPropsResult {
  const {
    busy,
    ctx,
    provider,
    dragReorder,
    selection,
    edits,
    onEditPage,
    onPageEditorTrigger,
    setPreviewAssignment,
    setEditingItem,
    openFilePreview,
    setEditingFile,
    onPreviewAssignmentTrigger,
    onGradableEditorTrigger,
    onOfficeEditorTrigger,
    exportAdditions,
    addModuleItem,
    videoRepo,
  } = args;

  // Props shared by every item row in every module (module/item-specific
  // values are supplied by ModuleCard).
  const itemRowProps: ModuleItemRowSharedProps = {
    busy,
    itemNodes: dragReorder.itemNodes,
    selected: selection.selected,
    setSelected: selection.setSelected,
    toggleItemSelected: selection.toggleItemSelected,
    drag: dragReorder.drag,
    setDrag: dragReorder.setDrag,
    dragOverItem: dragReorder.dragOverItem,
    setDragOverItem: dragReorder.setDragOverItem,
    setDragOverModule: dragReorder.setDragOverModule,
    isDraggingItem: dragReorder.isDraggingItem,
    performMove: dragReorder.performMove,
    typeEdit: edits.typeEdit,
    setTypeEdit: edits.setTypeEdit,
    changeItemType: edits.changeItemType,
    drafts: edits.drafts,
    setDrafts: edits.setDrafts,
    saveItemTitle: edits.saveItemTitle,
    dueEdit: edits.dueEdit,
    setDueEdit: edits.setDueEdit,
    saveDueEdit: edits.saveDueEdit,
    pointsEdit: edits.pointsEdit,
    setPointsEdit: edits.setPointsEdit,
    savePointsEdit: edits.savePointsEdit,
    moveItem: edits.moveItem,
    indentItem: edits.indentItem,
    toggleItem: edits.toggleItem,
    onEditPage,
    onPageEditorTrigger,
    setPreviewAssignment,
    setEditingItem,
    openFilePreview,
    setEditingFile,
    onPreviewAssignmentTrigger,
    onGradableEditorTrigger,
    onOfficeEditorTrigger,
    confirmId: edits.confirmId,
    removeItem: edits.removeItem,
    onRemoveExportAddition: exportAdditions.removeItem,
    sourceContext: ctx,
  };

  // Props shared by every "Add item" row in every module.
  const addItemRowProps: AddItemRowSharedProps = {
    busy,
    sourceContext: ctx,
    addType: addModuleItem.addType,
    setAddType: addModuleItem.setAddType,
    openVideoPicker: videoRepo.openVideoPicker,
    openRepoPicker: videoRepo.openRepoPicker,
    addFileFormat: addModuleItem.addFileFormat,
    setAddFileFormat: addModuleItem.setAddFileFormat,
    addAiPrompt: addModuleItem.addAiPrompt,
    setAddAiPrompt: addModuleItem.setAddAiPrompt,
    addAiBusy: addModuleItem.addAiBusy,
    addAiGenerate: addModuleItem.addAiGenerate,
    addFileContent: addModuleItem.addFileContent,
    setAddFileContent: addModuleItem.setAddFileContent,
    addUrl: addModuleItem.addUrl,
    setAddUrl: addModuleItem.setAddUrl,
    addTitle: addModuleItem.addTitle,
    setAddTitle: addModuleItem.setAddTitle,
    videoPickerModuleId: videoRepo.videoPickerModuleId,
    videoPickerLoading: videoRepo.videoPickerLoading,
    videoPickerError: videoRepo.videoPickerError,
    videoPickerFiles: videoRepo.videoPickerFiles,
    videoPickerBusy: videoRepo.videoPickerBusy,
    addVideoFromLibrary: videoRepo.addVideoFromLibrary,
    closeVideoPicker: videoRepo.closeVideoPicker,
    repoPickerModuleId: videoRepo.repoPickerModuleId,
    repoPickerLoading: videoRepo.repoPickerLoading,
    repoPickerError: videoRepo.repoPickerError,
    ownedRepos: videoRepo.ownedRepos,
    addRepoValue: videoRepo.addRepoValue,
    setAddRepoValue: videoRepo.setAddRepoValue,
    addRepoTitle: videoRepo.addRepoTitle,
    setAddRepoTitle: videoRepo.setAddRepoTitle,
    repoPickerBusy: videoRepo.repoPickerBusy,
    addRepoLink: videoRepo.addRepoLink,
    closeRepoPicker: videoRepo.closeRepoPicker,
    asgOf: addModuleItem.asgOf,
    patchAsg: addModuleItem.patchAsg,
    addItem: addModuleItem.addItem,
    canAdd: addModuleItem.canAdd,
    handleModuleFiles: addModuleItem.handleModuleFiles,
    uploads: addModuleItem.uploads,
  };

  // AC10 - one threaded object, mirroring addItemRowProps above.
  const exportAdditionsProps: ExportAddItemRowSharedProps = {
    sourceContext: ctx,
    courseId: exportAdditions.courseId,
    provider,
    addItem: exportAdditions.addItem,
  };

  return { itemRowProps, addItemRowProps, exportAdditionsProps };
}
