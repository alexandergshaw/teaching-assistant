"use client";

import { useMemo, useState } from "react";
import { Button } from "@mui/material";
import { previewFileAction } from "../../actions";
import { useLlmProvider } from "@/lib/llm-provider";
import { useSupabase } from "@/context/SupabaseProvider";
import type {
  CanvasAddableContent,
  CanvasModule,
  CanvasModuleItem,
} from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import styles from "../../page.module.css";
import FilePreviewModal, { type PreviewFile } from "../FilePreviewModal";
import { base64ToBlobUrl } from "./utils";
import { canvasModulesToDisplay, cartridgeModulesToDisplay, type DisplayModule, type DisplayModuleItem } from "./display-module-tree";
import { LIVE_CONTENT_SOURCE, gateOperation, type ContentSourceContext } from "./contentSourceGating";
import { AssignmentPreviewModal } from "./AssignmentPreviewModal";
import { BulkCreateModulesModal } from "./BulkCreateModulesModal";
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
import { DownloadSelectionSection } from "./modules/DownloadSelectionSection";
import { GeneratedPreviewModal } from "./modules/GeneratedPreviewModal";
import { GenerateFromSelectionSection } from "./modules/GenerateFromSelectionSection";
import { ModulesHeaderBar } from "./modules/ModulesHeaderBar";
import { NewAssignmentPanel } from "./modules/NewAssignmentPanel";
import { useAddModuleItem } from "./modules/useAddModuleItem";
import { useBulkItemActions } from "./modules/useBulkItemActions";
import { useBulkModuleActions } from "./modules/useBulkModuleActions";
import { useDragReorder } from "./modules/useDragReorder";
import { useInlineModuleEdits } from "./modules/useInlineModuleEdits";
import { useLmsGeneration } from "./modules/useLmsGeneration";
import { useLmsSyllabusButtons } from "./modules/useLmsSyllabusButtons";
import { useModuleSelection } from "./modules/useModuleSelection";
import { useNewAssignmentForm } from "./modules/useNewAssignmentForm";
import { useRubrics } from "./modules/useRubrics";
import { useSelectionDownload } from "./modules/useSelectionDownload";
import { useStickyHeaderResize } from "./modules/useStickyHeaderResize";
import { useVideoRepoPickers } from "./modules/useVideoRepoPickers";

export function ModulesView({
  courseUrl,
  exportCourseId,
  acronym,
  modules,
  exportModules,
  sourceContext,
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
  /** An export selection's course_hub row id - the export counterpart of
   * `courseUrl` above, threaded through from ContentTab the same way (see
   * that file's own `exportCourseId` derivation, next to `courseUrl`'s).
   * Undefined whenever the active selection is live - see
   * useSelectionDownload.ts's own header comment on the FINDING 1 fix this
   * closes (an export selection has no Canvas URL at all, so `courseUrl`
   * alone could never identify it). */
  exportCourseId?: string;
  acronym?: string;
  modules: CanvasModule[];
  /** A parsed course-export tree, when the active source is "export" - see
   * display-module-tree.ts. Absent/null whenever the active source is
   * "canvas" (`modules` above is then the live tree, as before this prop
   * existed). */
  exportModules?: CartridgeModule[] | null;
  /** Which Course Content source is active, and whether a live Canvas course
   * is linked to write to - see contentSourceGating.ts. Optional and
   * defaulted to LIVE_CONTENT_SOURCE so behaviour is unchanged for a live
   * selection, which is still the only reachable one until
   * EXPORT_COURSES_SELECTABLE flips (ContentTab.tsx). */
  sourceContext?: ContentSourceContext;
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
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // The module tree actually rendered below - built from whichever source is
  // active (display-module-tree.ts converts either without fabricating a
  // single Canvas-only field). `modules`/`exportModules` themselves stay
  // exactly as ContentTab fills them (live-only / export-only respectively -
  // see that component's `loadContent`), so this is the one place the two
  // are reconciled into one tree for rendering.
  const displayModules: DisplayModule[] = useMemo(
    () => (ctx.source === "export" ? cartridgeModulesToDisplay(exportModules ?? []) : canvasModulesToDisplay(modules)),
    [ctx.source, exportModules, modules]
  );
  const [provider] = useLlmProvider();
  const { supabase, user } = useSupabase();

  // Resizable sticky header, module/item search + selection, rubrics, and the
  // single-item CRUD helpers (including the shared `run` write-and-reconcile
  // helper other hooks below reuse for their own one-off writes).
  const { headerBodyRef, headerHeight, setHeaderHeight, onResizeStart } = useStickyHeaderResize();
  const selection = useModuleSelection(modules, setNote, exportModules);
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
  const syllabusButtons = useLmsSyllabusButtons(courseUrl, acronym, provider, modules, setNote, setBusy, reload);
  // "Generate from selection" (chunk 1: anticipated Q&A, current events;
  // chunk 3b: four more kinds that also POST to Canvas). GENERATE/REFINE stay
  // off the outer `busy`/`reload` for every kind - neither ever writes to
  // Canvas - but POST (chunk 3b, posting kinds only) now holds `busy` and
  // calls `reload()` for the duration of its own Canvas write, the same as
  // every other write in this tab; see useLmsGeneration.ts's own header
  // comment for the full rationale. No `acronym` -
  // generateFromSelectionAction/refineGeneratedArtifactAction/
  // postGeneratedArtifactAction resolve institution routing from the DB
  // course row themselves.
  const lmsGeneration = useLmsGeneration(
    courseUrl,
    provider,
    selection.selectedMaterialItems,
    selection.selectedModules,
    modules,
    setNote,
    setBusy,
    reload,
    exportModules
  );

  // "Download" (docs/lms-selection-export-download-acceptance-criteria.md) -
  // a course export (.imscc) and/or a plain zip of just the current
  // selection. A READ, never a write (AC8/AC10): it owns its own busy state
  // the same independent way `lmsGeneration` does (see useSelectionDownload.ts's
  // own header comment on why it does not share `opBusy` either), and never
  // calls `setBusy`/`reload()` - nothing about the module tree changes from
  // downloading a copy of it.
  const selectionDownload = useSelectionDownload(
    courseUrl,
    exportCourseId,
    acronym,
    courseName,
    ctx.source,
    selection.selectedMaterialItems,
    selection.selectedModules,
    modules,
    exportModules,
    setNote
  );

  // Shared busy flag for the bulk toolbar (module-level and item-level ops
  // both disable the same buttons while a batch write is in flight).
  const [opBusy, setOpBusy] = useState(false);
  const bulkModuleActions = useBulkModuleActions(
    courseUrl,
    acronym,
    provider,
    modules,
    // useBulkModuleActions is Canvas-write-only (publish/delete/add-to-
    // module) and predates useModuleSelection's discriminated module-key
    // scheme (liveModuleKey/exportModuleKey) - it still speaks a plain
    // Set<number> of live Canvas module ids, which selection.liveModuleIds/
    // setLiveModuleIds provide as a derived, backward-compatible view over
    // the hook's real Set<string> state (see useModuleSelection.ts's own
    // doc comment on UseModuleSelectionReturn).
    selection.liveModuleIds,
    selection.setLiveModuleIds,
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

  // Display-tree equivalents of selection.moduleMatches/itemVisible
  // (useModuleSelection.ts, unchanged by this file): that hook's own
  // versions are typed against the live CanvasModule/CanvasModuleItem it
  // scans, so they cannot be called with `displayModules`' mixed-source
  // DisplayModule/DisplayModuleItem entries. Same search-matching logic,
  // read from whichever fields either source's display item actually has
  // (`name`/`items[].title` - both always present, live or export).
  const displayModuleMatches = (m: DisplayModule): boolean =>
    !selection.moduleSearchLc ||
    m.name.toLowerCase().includes(selection.moduleSearchLc) ||
    m.items.some((it) => it.title.toLowerCase().includes(selection.moduleSearchLc));
  const displayItemVisible = (m: DisplayModule, it: DisplayModuleItem): boolean =>
    !selection.moduleSearchLc ||
    m.name.toLowerCase().includes(selection.moduleSearchLc) ||
    it.title.toLowerCase().includes(selection.moduleSearchLc);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
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
    setPreviewAssignment,
    setEditingItem,
    openFilePreview,
    setEditingFile,
    confirmId: edits.confirmId,
    removeItem: edits.removeItem,
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
            sourceContext={ctx}
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
            setBulkCreateOpen={setBulkCreateOpen}
            setRenameOpen={setRenameOpen}
            setScheduleOpen={setScheduleOpen}
            rubrics={rubricsHook.rubrics}
            setRubricBuilder={rubricsHook.setRubricBuilder}
            editRubricId={rubricsHook.editRubricId}
            setEditRubricId={rubricsHook.setEditRubricId}
            syllabusButtonsBusy={syllabusButtons.busy}
            onCreateAckQuiz={syllabusButtons.createAckQuiz}
            onGenerateSyllabus={syllabusButtons.generateSyllabus}
            syllabusTemplateFileInputRef={syllabusButtons.fileInputRef}
            onSyllabusTemplateFileChange={syllabusButtons.handleTemplateFileChange}
            syllabusModuleChoice={syllabusButtons.moduleChoice}
            onSyllabusModuleChoiceChange={syllabusButtons.setModuleChoice}
            syllabusNewModuleName={syllabusButtons.newModuleName}
            onSyllabusNewModuleNameChange={syllabusButtons.setNewModuleName}
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

              <GenerateFromSelectionSection
                busy={lmsGeneration.busy}
                kinds={lmsGeneration.kinds}
                onGenerate={lmsGeneration.generate}
                templates={lmsGeneration.templates}
                templateId={lmsGeneration.templateId}
                onTemplateChange={lmsGeneration.setTemplateId}
              />

              <DownloadSelectionSection
                busy={selectionDownload.busy}
                onDownload={selectionDownload.download}
                imsccUnavailableReason={selectionDownload.imsccUnavailableReason}
                zipUnavailableReason={selectionDownload.zipUnavailableReason}
              />

              {selection.selectedModules.size > 0 && (
                <BulkModulesSection
                  opBusy={opBusy}
                  sourceContext={ctx}
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
                  sourceContext={ctx}
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

      {/* Gated as ONE unit, the same way AddItemRow is (entry 264 check 8).
          Every control in this panel - "Add module", the "New assignment"
          toggle and the whole form behind it - ends in a Canvas write keyed on
          a live courseUrl, so there is no half of it worth offering against a
          stored export. Its own guards are only `busy || !newModuleName.trim()`,
          which stay TRUE for an export selection, so without this the buttons
          would be clickable and fail with a raw technical error instead of the
          gating table's wording. Found once EXPORT_COURSES_SELECTABLE flipped;
          before that this panel was unreachable in export mode. */}
      {(() => {
        const panelGate = gateOperation(ctx, "courseWrite");
        return !panelGate.allowed ? (
          <p className={styles.fieldHint}>{panelGate.reason}</p>
        ) : (
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
        );
      })()}

      {displayModules.length === 0 && <p className={styles.emptyState}>This course has no modules yet.</p>}

      {selection.moduleSearchLc && displayModules.length > 0 && !displayModules.some(displayModuleMatches) && (
        <p className={styles.emptyState}>No modules or items match &quot;{selection.moduleSearch.trim()}&quot;.</p>
      )}

      {displayModules.map((m, mi) => {
        if (!displayModuleMatches(m)) return null;
        // Export modules track their own expand/collapse locally (ModuleCard
        // - there is no numeric Canvas id for `expanded` to key on), so
        // `open`/`onToggleExpand` below are read only by the live branch.
        const open = m.id != null && expanded.has(m.id);
        return (
          <ModuleCard
            key={m.id ?? m.identifier ?? mi}
            m={m}
            mi={mi}
            isFirst={mi === 0}
            isLast={mi === displayModules.length - 1}
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
            setSelected={selection.setSelected}
            setSelectedModules={selection.setSelectedModules}
            itemVisible={displayItemVisible}
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
            sourceContext={ctx}
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

      {bulkCreateOpen && (
        <BulkCreateModulesModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setBulkCreateOpen(false)}
          onApplied={(message) => {
            setBulkCreateOpen(false);
            setNote({ kind: "success", text: message });
            reload();
          }}
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

      {lmsGeneration.preview && (
        <GeneratedPreviewModal
          busy={lmsGeneration.busy}
          preview={lmsGeneration.preview}
          onClosePreview={lmsGeneration.closePreview}
          onSelectVersion={lmsGeneration.selectVersion}
          instructions={lmsGeneration.instructions}
          onInstructionsChange={lmsGeneration.setInstructions}
          onRefine={lmsGeneration.refine}
          refining={lmsGeneration.refining}
          downloadFormats={lmsGeneration.downloadFormats}
          downloading={lmsGeneration.downloading}
          onDownload={lmsGeneration.download}
          offersPost={lmsGeneration.offersPost}
          postNeedsModuleTarget={lmsGeneration.postNeedsModuleTarget}
          postModuleOptions={lmsGeneration.postModuleOptions}
          postModuleChoice={lmsGeneration.postModuleChoice}
          onPostModuleChoiceChange={lmsGeneration.setPostModuleChoice}
          postNewModuleName={lmsGeneration.postNewModuleName}
          onPostNewModuleNameChange={lmsGeneration.setPostNewModuleName}
          onPost={lmsGeneration.post}
          posting={lmsGeneration.posting}
        />
      )}
    </div>
  );
}


// ── Tab shell ───────────────────────────────────────────────────────────────-
