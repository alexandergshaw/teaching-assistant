"use client";

import { useState } from "react";
import { Button } from "@mui/material";
import { previewFileAction } from "../../actions";
import { useLlmProvider } from "@/lib/llm-provider";
import { useSupabase } from "@/context/SupabaseProvider";
import type {
  CanvasAddableContent,
  CanvasModule,
  CanvasModuleItem,
} from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import FilePreviewModal, { type PreviewFile } from "../FilePreviewModal";
import { base64ToBlobUrl } from "./utils";
import { AssignmentPreviewModal } from "./AssignmentPreviewModal";
import { BulkQuestionsModal } from "./BulkQuestionsModal";
import { BulkUploadModal } from "./BulkUploadModal";
import { GradableEditorModal } from "./GradableEditorModal";
import { OfficeEditorModal } from "./OfficeEditorModal";
import { RenameModulesModal } from "./RenameModulesModal";
import { RubricBuilderModal } from "./RubricBuilderModal";
import { SchedulerModal } from "./SchedulerModal";
import { AddItemRowSharedProps, ModuleCard, ModuleItemRowSharedProps } from "./modules/ModuleCard";
import { BulkItemsSection } from "./modules/BulkItemsSection";
import { BulkModulesSection } from "./modules/BulkModulesSection";
import { ModulesHeaderBar } from "./modules/ModulesHeaderBar";
import { NewAssignmentPanel } from "./modules/NewAssignmentPanel";
import { useAddModuleItem } from "./modules/useAddModuleItem";
import { useBulkItemActions } from "./modules/useBulkItemActions";
import { useBulkModuleActions } from "./modules/useBulkModuleActions";
import { useDragReorder } from "./modules/useDragReorder";
import { useInlineModuleEdits } from "./modules/useInlineModuleEdits";
import { useModuleSelection } from "./modules/useModuleSelection";
import { useNewAssignmentForm } from "./modules/useNewAssignmentForm";
import { useRubrics } from "./modules/useRubrics";
import { useStickyHeaderResize } from "./modules/useStickyHeaderResize";
import { useVideoRepoPickers } from "./modules/useVideoRepoPickers";

export function ModulesView({
  courseUrl,
  acronym,
  modules,
  targets,
  ensureTargets,
  busy,
  expanded,
  onToggleExpand,
  onEditPage,
  setModules,
  reload,
  setNote,
  setBusy,
  courseName,
  onExport,
  onImport,
  refreshing,
  canCopy,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  targets: CanvasAddableContent | null;
  /** Lazily load the existing-content lists (used by the bulk file picker). */
  ensureTargets: () => void;
  busy: boolean;
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onEditPage: (pageUrl: string) => void;
  setModules: React.Dispatch<React.SetStateAction<CanvasModule[]>>;
  reload: () => void;
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
  setBusy: (b: boolean) => void;
  /** Course title + copy/import/refresh controls hosted in the sticky header. */
  courseName?: string;
  onExport: () => void;
  onImport: () => void;
  refreshing: boolean;
  canCopy: boolean;
}) {
  const [provider] = useLlmProvider();
  const { supabase, user } = useSupabase();

  // Resizable sticky header, module/item search + selection, rubrics, and the
  // single-item CRUD helpers (including the shared `run` write-and-reconcile
  // helper other hooks below reuse for their own one-off writes).
  const { headerBodyRef, headerHeight, setHeaderHeight, onResizeStart } = useStickyHeaderResize();
  const selection = useModuleSelection(modules, setNote);
  const rubricsHook = useRubrics(courseUrl, acronym);
  const edits = useInlineModuleEdits(courseUrl, acronym, modules, setModules, setBusy, setNote, reload);
  const dragReorder = useDragReorder(
    modules,
    setModules,
    selection.selected,
    selection.setSelected,
    courseUrl,
    acronym,
    setBusy,
    setNote,
    reload,
    edits.run
  );
  const newAssignmentForm = useNewAssignmentForm(courseUrl, acronym, modules, edits.run, reload, setNote);
  const videoRepo = useVideoRepoPickers(courseUrl, acronym, user, supabase, setNote, reload);
  const addModuleItem = useAddModuleItem(courseUrl, acronym, provider, setBusy, setNote, reload, edits.run);

  // Shared busy flag for the bulk toolbar (module-level and item-level ops
  // both disable the same buttons while a batch write is in flight).
  const [opBusy, setOpBusy] = useState(false);
  const bulkModuleActions = useBulkModuleActions(
    courseUrl,
    acronym,
    provider,
    modules,
    selection.selectedModules,
    selection.setSelectedModules,
    targets,
    setOpBusy,
    setNote,
    reload
  );
  const bulkItemActions = useBulkItemActions(
    courseUrl,
    acronym,
    modules,
    selection.selected,
    selection.selectedItems,
    selection.clearSelection,
    rubricsHook.rubrics,
    rubricsHook.setRubricBuilder,
    opBusy,
    setOpBusy,
    setNote,
    reload
  );

  // The course's base URL (".../courses/123"), used to build "Open on Canvas" links.
  const courseBase = courseUrl.replace(/(\/courses\/\d+).*$/, "$1");

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CanvasModuleItem | null>(null);
  const [filePreview, setFilePreview] = useState<{ file: PreviewFile; blobUrl: string | null } | null>(null);
  const [editingFile, setEditingFile] = useState<CanvasModuleItem | null>(null);
  // The assignment being previewed in a read-only modal.
  const [previewAssignment, setPreviewAssignment] = useState<CanvasModuleItem | null>(null);

  const openFilePreview = async (it: CanvasModuleItem) => {
    if (it.contentId == null) return;
    setFilePreview({ file: { student: "", name: it.title, extension: "", content: "Loading…", truncated: false }, blobUrl: null });
    const result = await previewFileAction(courseUrl, it.contentId, acronym);
    if ("error" in result) {
      setFilePreview({ file: { student: "", name: it.title, extension: "", content: result.error, truncated: false }, blobUrl: null });
      return;
    }
    const p = result.preview;
    const blobUrl = p.base64 ? base64ToBlobUrl(p.base64, p.mimeType) : null;
    setFilePreview({
      file: {
        student: "",
        name: p.name,
        extension: "",
        content: p.text,
        truncated: p.truncated,
        rawBase64: p.base64 || undefined,
        mimeType: p.mimeType,
      },
      blobUrl,
    });
  };

  const closeFilePreview = () =>
    setFilePreview((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });

  // Props shared by every item row in every module (module/item-specific
  // values are supplied by ModuleCard).
  const itemRowProps: ModuleItemRowSharedProps = {
    busy,
    itemNodes: dragReorder.itemNodes,
    selected: selection.selected,
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
    setPreviewAssignment,
    setEditingItem,
    openFilePreview,
    setEditingFile,
    confirmId: edits.confirmId,
    removeItem: edits.removeItem,
  };

  // Props shared by every "Add item" row in every module.
  const addItemRowProps: AddItemRowSharedProps = {
    busy,
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

  return (
    <div className={styles.form}>
      <div className={styles.ccStickyHeader}>
        <div
          className={styles.ccHeaderBody}
          ref={headerBodyRef}
          style={headerHeight != null ? { maxHeight: headerHeight, overflowY: "auto" } : undefined}
        >
          <ModulesHeaderBar
            courseName={courseName}
            onExport={onExport}
            onImport={onImport}
            canCopy={canCopy}
            reload={reload}
            busy={busy}
            refreshing={refreshing}
            moduleSearch={selection.moduleSearch}
            setModuleSearch={selection.setModuleSearch}
            allSelected={selection.allSelected}
            toggleAll={selection.toggleAll}
            allKeysLength={selection.allKeys.length}
            allModulesSelected={selection.allModulesSelected}
            toggleAllModules={selection.toggleAllModules}
            visibleModulesLength={selection.visibleModules.length}
            selectByKind={selection.selectByKind}
            modules={modules}
            setBulkUploadOpen={setBulkUploadOpen}
            setRenameOpen={setRenameOpen}
            setScheduleOpen={setScheduleOpen}
            rubrics={rubricsHook.rubrics}
            setRubricBuilder={rubricsHook.setRubricBuilder}
            editRubricId={rubricsHook.editRubricId}
            setEditRubricId={rubricsHook.setEditRubricId}
          />

          {(selection.selected.size > 0 || selection.selectedModules.size > 0) && (
            <div className={styles.bulkBar}>
              <div className={styles.bulkBarHead}>
                <span className={styles.bulkCount}>
                  {[
                    selection.selectedModules.size > 0
                      ? `${selection.selectedModules.size} module${selection.selectedModules.size === 1 ? "" : "s"}`
                      : "",
                    selection.selected.size > 0 ? `${selection.selected.size} item${selection.selected.size === 1 ? "" : "s"}` : "",
                  ]
                    .filter(Boolean)
                    .join(", ")}{" "}
                  selected
                </span>
                <Button variant="outlined" size="small" onClick={selection.clearSelection}>
                  Clear
                </Button>
              </div>

              {selection.selectedModules.size > 0 && (
                <BulkModulesSection
                  opBusy={opBusy}
                  bulkPublishModules={bulkModuleActions.bulkPublishModules}
                  bulkDeleteModules={bulkModuleActions.bulkDeleteModules}
                  confirmDeleteModules={bulkModuleActions.confirmDeleteModules}
                  bulkAddType={bulkModuleActions.bulkAddType}
                  setBulkAddType={bulkModuleActions.setBulkAddType}
                  bulkAddPattern={bulkModuleActions.bulkAddPattern}
                  setBulkAddPattern={bulkModuleActions.setBulkAddPattern}
                  bulkAddSubType={bulkModuleActions.bulkAddSubType}
                  setBulkAddSubType={bulkModuleActions.setBulkAddSubType}
                  bulkAiBusy={bulkModuleActions.bulkAiBusy}
                  bulkAddFileContent={bulkModuleActions.bulkAddFileContent}
                  setBulkAddFileContent={bulkModuleActions.setBulkAddFileContent}
                  bulkAddFileId={bulkModuleActions.bulkAddFileId}
                  setBulkAddFileId={bulkModuleActions.setBulkAddFileId}
                  bulkAddToModules={bulkModuleActions.bulkAddToModules}
                  targets={targets}
                  ensureTargets={ensureTargets}
                  bulkAddFileFormat={bulkModuleActions.bulkAddFileFormat}
                  setBulkAddFileFormat={bulkModuleActions.setBulkAddFileFormat}
                  bulkFileOptions={bulkModuleActions.bulkFileOptions}
                  bulkAddDue={bulkModuleActions.bulkAddDue}
                  setBulkAddDue={bulkModuleActions.setBulkAddDue}
                  bulkAddStaggerOffset={bulkModuleActions.bulkAddStaggerOffset}
                  setBulkAddStaggerOffset={bulkModuleActions.setBulkAddStaggerOffset}
                  bulkAddStaggerUnit={bulkModuleActions.bulkAddStaggerUnit}
                  setBulkAddStaggerUnit={bulkModuleActions.setBulkAddStaggerUnit}
                  bulkAddPoints={bulkModuleActions.bulkAddPoints}
                  setBulkAddPoints={bulkModuleActions.setBulkAddPoints}
                  bulkAddRubricId={bulkModuleActions.bulkAddRubricId}
                  setBulkAddRubricId={bulkModuleActions.setBulkAddRubricId}
                  rubrics={rubricsHook.rubrics}
                  bulkAddDescription={bulkModuleActions.bulkAddDescription}
                  setBulkAddDescription={bulkModuleActions.setBulkAddDescription}
                  bulkAddQuestions={bulkModuleActions.bulkAddQuestions}
                  setBulkAddQuestions={bulkModuleActions.setBulkAddQuestions}
                  setBulkQuestionsOpen={bulkModuleActions.setBulkQuestionsOpen}
                  bulkAiPrompt={bulkModuleActions.bulkAiPrompt}
                  setBulkAiPrompt={bulkModuleActions.setBulkAiPrompt}
                  bulkAiGenerate={bulkModuleActions.bulkAiGenerate}
                />
              )}

              {selection.selected.size > 0 && (
                <BulkItemsSection
                  opBusy={opBusy}
                  selectedItems={selection.selectedItems}
                  setEditingItem={setEditingItem}
                  onEditPage={onEditPage}
                  bulkPublish={bulkItemActions.bulkPublish}
                  descSharedState={bulkItemActions.descSharedState}
                  bulkItemsDescription={bulkItemActions.bulkItemsDescription}
                  setBulkItemsDescription={bulkItemActions.setBulkItemsDescription}
                  bulkSetDescription={bulkItemActions.bulkSetDescription}
                  bulkItemsQuestions={bulkItemActions.bulkItemsQuestions}
                  setBulkItemsQuestionsOpen={bulkItemActions.setBulkItemsQuestionsOpen}
                  bulkAddQuestionsToQuizzes={bulkItemActions.bulkAddQuestionsToQuizzes}
                  bulkDue={bulkItemActions.bulkDue}
                  setBulkDue={bulkItemActions.setBulkDue}
                  bulkSetDue={bulkItemActions.bulkSetDue}
                  bulkShift={bulkItemActions.bulkShift}
                  setBulkShift={bulkItemActions.setBulkShift}
                  bulkShiftDue={bulkItemActions.bulkShiftDue}
                  bulkStaggerOffset={bulkItemActions.bulkStaggerOffset}
                  setBulkStaggerOffset={bulkItemActions.setBulkStaggerOffset}
                  bulkStaggerUnit={bulkItemActions.bulkStaggerUnit}
                  setBulkStaggerUnit={bulkItemActions.setBulkStaggerUnit}
                  bulkStaggerDue={bulkItemActions.bulkStaggerDue}
                  bulkPoints={bulkItemActions.bulkPoints}
                  setBulkPoints={bulkItemActions.setBulkPoints}
                  bulkSetPoints={bulkItemActions.bulkSetPoints}
                  bulkRubricId={bulkItemActions.bulkRubricId}
                  setBulkRubricId={bulkItemActions.setBulkRubricId}
                  rubrics={rubricsHook.rubrics}
                  bulkRubric={bulkItemActions.bulkRubric}
                  setRubricBuilder={rubricsHook.setRubricBuilder}
                  openRubricBuilder={bulkItemActions.openRubricBuilder}
                  bulkSubType={bulkItemActions.bulkSubType}
                  setBulkSubType={bulkItemActions.setBulkSubType}
                  bulkUpdateSubmissionType={bulkItemActions.bulkUpdateSubmissionType}
                  selectedAssignmentCount={bulkItemActions.selectedAssignmentCount}
                  bulkModuleShift={bulkItemActions.bulkModuleShift}
                  setBulkModuleShift={bulkItemActions.setBulkModuleShift}
                  bulkShiftModules={bulkItemActions.bulkShiftModules}
                  bulkTargetModule={bulkItemActions.bulkTargetModule}
                  setBulkTargetModule={bulkItemActions.setBulkTargetModule}
                  modules={modules}
                  bulkMoveToModule={bulkItemActions.bulkMoveToModule}
                  bulkRemoveFromModule={bulkItemActions.bulkRemoveFromModule}
                  bulkDeleteContent={bulkItemActions.bulkDeleteContent}
                  confirmDeleteContent={bulkItemActions.confirmDeleteContent}
                />
              )}
            </div>
          )}
        </div>
        <div
          className={styles.ccHeaderResize}
          onPointerDown={onResizeStart}
          onDoubleClick={() => setHeaderHeight(null)}
          role="separator"
          aria-orientation="horizontal"
          title="Drag to make the header shorter; double-click to reset"
        />
      </div>

      <NewAssignmentPanel
        courseUrl={courseUrl}
        acronym={acronym}
        modules={modules}
        busy={busy}
        newModuleName={newAssignmentForm.newModuleName}
        setNewModuleName={newAssignmentForm.setNewModuleName}
        handleAddModule={newAssignmentForm.handleAddModule}
        showNewAssignment={newAssignmentForm.showNewAssignment}
        setShowNewAssignment={newAssignmentForm.setShowNewAssignment}
        naName={newAssignmentForm.naName}
        setNaName={newAssignmentForm.setNaName}
        naPoints={newAssignmentForm.naPoints}
        setNaPoints={newAssignmentForm.setNaPoints}
        naGrading={newAssignmentForm.naGrading}
        setNaGrading={newAssignmentForm.setNaGrading}
        naDue={newAssignmentForm.naDue}
        setNaDue={newAssignmentForm.setNaDue}
        naUnlock={newAssignmentForm.naUnlock}
        setNaUnlock={newAssignmentForm.setNaUnlock}
        naLock={newAssignmentForm.naLock}
        setNaLock={newAssignmentForm.setNaLock}
        naAttempts={newAssignmentForm.naAttempts}
        setNaAttempts={newAssignmentForm.setNaAttempts}
        naType={newAssignmentForm.naType}
        setNaType={newAssignmentForm.setNaType}
        naExtensions={newAssignmentForm.naExtensions}
        setNaExtensions={newAssignmentForm.setNaExtensions}
        naModuleId={newAssignmentForm.naModuleId}
        setNaModuleId={newAssignmentForm.setNaModuleId}
        naGroupId={newAssignmentForm.naGroupId}
        setNaGroupId={newAssignmentForm.setNaGroupId}
        naGroups={newAssignmentForm.naGroups}
        setNaGroups={newAssignmentForm.setNaGroups}
        naPeer={newAssignmentForm.naPeer}
        setNaPeer={newAssignmentForm.setNaPeer}
        naOmit={newAssignmentForm.naOmit}
        setNaOmit={newAssignmentForm.setNaOmit}
        naPublish={newAssignmentForm.naPublish}
        setNaPublish={newAssignmentForm.setNaPublish}
        naDescription={newAssignmentForm.naDescription}
        setNaDescription={newAssignmentForm.setNaDescription}
        naDrafting={newAssignmentForm.naDrafting}
        handleDraftDescription={newAssignmentForm.handleDraftDescription}
        naBusy={newAssignmentForm.naBusy}
        handleCreateAssignment={newAssignmentForm.handleCreateAssignment}
      />

      {modules.length === 0 && <p className={styles.emptyState}>This course has no modules yet.</p>}

      {selection.moduleSearchLc && modules.length > 0 && !modules.some(selection.moduleMatches) && (
        <p className={styles.emptyState}>No modules or items match &quot;{selection.moduleSearch.trim()}&quot;.</p>
      )}

      {modules.map((m, mi) => {
        if (!selection.moduleMatches(m)) return null;
        const open = expanded.has(m.id);
        return (
          <ModuleCard
            key={m.id}
            m={m}
            mi={mi}
            isFirst={mi === 0}
            isLast={mi === modules.length - 1}
            open={open}
            onToggleExpand={onToggleExpand}
            busy={busy}
            courseBase={courseBase}
            confirmId={edits.confirmId}
            drafts={edits.drafts}
            setDrafts={edits.setDrafts}
            saveModuleName={edits.saveModuleName}
            moveModule={edits.moveModule}
            toggleModule={edits.toggleModule}
            removeModule={edits.removeModule}
            selectedModules={selection.selectedModules}
            toggleModuleSelected={selection.toggleModuleSelected}
            toggleModuleItems={selection.toggleModuleItems}
            selected={selection.selected}
            itemVisible={selection.itemVisible}
            moduleNodes={dragReorder.moduleNodes}
            moduleDrag={dragReorder.moduleDrag}
            setModuleDrag={dragReorder.setModuleDrag}
            dragOverModuleRow={dragReorder.dragOverModuleRow}
            setDragOverModuleRow={dragReorder.setDragOverModuleRow}
            performModuleMove={dragReorder.performModuleMove}
            drag={dragReorder.drag}
            dragOverModule={dragReorder.dragOverModule}
            setDragOverModule={dragReorder.setDragOverModule}
            performMove={dragReorder.performMove}
            itemRowProps={itemRowProps}
            addItemRowProps={addItemRowProps}
          />
        );
      })}

      {scheduleOpen && (
        <SchedulerModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setScheduleOpen(false)}
          onApplied={(message) => {
            setScheduleOpen(false);
            setNote({ kind: "success", text: message });
          }}
        />
      )}

      {bulkUploadOpen && (
        <BulkUploadModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setBulkUploadOpen(false)}
          onDone={reload}
        />
      )}

      {renameOpen && (
        <RenameModulesModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setRenameOpen(false)}
          onApplied={(message) => {
            setRenameOpen(false);
            setNote({ kind: "success", text: message });
            reload();
          }}
        />
      )}

      {bulkModuleActions.bulkQuestionsOpen && (
        <BulkQuestionsModal
          questions={bulkModuleActions.bulkAddQuestions}
          setQuestions={bulkModuleActions.setBulkAddQuestions}
          onClose={() => bulkModuleActions.setBulkQuestionsOpen(false)}
        />
      )}

      {bulkItemActions.bulkItemsQuestionsOpen && (
        <BulkQuestionsModal
          questions={bulkItemActions.bulkItemsQuestions}
          setQuestions={bulkItemActions.setBulkItemsQuestions}
          onClose={() => bulkItemActions.setBulkItemsQuestionsOpen(false)}
        />
      )}

      {editingItem && (
        <GradableEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={reload}
        />
      )}

      {filePreview && (
        <FilePreviewModal
          selectedPreview={filePreview.file}
          previewBlobUrl={filePreview.blobUrl}
          onClose={closeFilePreview}
        />
      )}

      {editingFile && editingFile.contentId != null && (
        <OfficeEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          fileId={editingFile.contentId}
          fileName={editingFile.title}
          onClose={() => setEditingFile(null)}
          onSaved={() => setNote({ kind: "success", text: "Saved to Canvas." })}
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
        />
      )}

      {previewAssignment && (
        <AssignmentPreviewModal
          courseUrl={courseUrl}
          acronym={acronym}
          item={previewAssignment}
          onClose={() => setPreviewAssignment(null)}
        />
      )}
    </div>
  );
}


// ── Tab shell ───────────────────────────────────────────────────────────────-
