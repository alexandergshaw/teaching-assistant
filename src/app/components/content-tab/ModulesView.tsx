"use client";

import { useRef } from "react";
import { useLlmProvider } from "@/lib/llm-provider";
import { useSupabase } from "@/context/SupabaseProvider";
import type {
  CanvasAddableContent,
  CanvasModule,
} from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import styles from "../../page.module.css";
import { LIVE_CONTENT_SOURCE, type ContentSourceContext } from "./contentSourceGating";
import { ModuleCard } from "./modules/ModuleCard";
import { buildBulkModulesSectionProps } from "./modules/buildBulkModulesSectionProps";
import { AskAiSelectionSection } from "./modules/AskAiSelectionSection";
import { BulkBarHead } from "./modules/BulkBarHead";
import { BulkItemsSection } from "./modules/BulkItemsSection";
import { BulkModulesSection } from "./modules/BulkModulesSection";
import type { BulkBarFacts } from "./modules/bulkBarGroups";
import { buildBulkBarFacts } from "./modules/buildBulkBarFacts";
import { CommandInterfaceSection } from "./modules/CommandInterfaceSection";
import { useCommandInterface } from "./modules/useCommandInterface";
import { DownloadSelectionSection } from "./modules/DownloadSelectionSection";
import { GeneratedPreviewModal } from "./modules/GeneratedPreviewModal";
import { GenerateFromSelectionSection } from "./modules/GenerateFromSelectionSection";
import { ModulesHeaderBar } from "./modules/ModulesHeaderBar";
import { ModulesViewSecondaryModals } from "./modules/ModulesViewSecondaryModals";
import { NewAssignmentGate } from "./modules/NewAssignmentGate";
import { RepoFoldersSection } from "./modules/RepoFoldersSection";
import { ScheduledReleaseSection } from "./modules/ScheduledReleaseSection";
import { useScheduledRelease } from "./modules/useScheduledRelease";
import { useBulkBarGroups } from "./modules/useBulkBarGroups";
import { useModulesViewOrchestration } from "./modules/useModulesViewOrchestration";
import { useRubrics } from "./modules/useRubrics";
import { useSelectionChatContext } from "./modules/useSelectionChatContext";
import { useSelectionDownload } from "./modules/useSelectionDownload";
import { useVisualizerCoverage } from "./modules/useVisualizerCoverage";
import { VisualizerCoverageSection } from "./modules/VisualizerCoverageSection";

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
  onPageEditorTrigger,
  setModules,
  reload,
  setNote,
  setBusy,
  courseName,
  onExport,
  onImport,
  onCopyModalTrigger,
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
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
   * wave R3 slice A): PageEditorModal's state lives in ContentTab.tsx, one
   * boundary above this file; this is a pure pass-through to
   * BulkItemsSection (a direct prop below) and to ModuleItemRow via
   * ModuleCard as the intermediary (folded into itemRowProps, spread onto
   * ModuleItemRow at ModuleCard.tsx's two render sites) - both are its
   * actual openers. */
  onPageEditorTrigger: (trigger: HTMLElement) => void;
  setModules: React.Dispatch<React.SetStateAction<CanvasModule[]>>;
  reload: () => void;
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
  setBusy: (b: boolean) => void;
  /** Course title + copy/import/refresh controls hosted in the sticky header. */
  courseName?: string;
  onExport: () => void;
  onImport: () => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
   * wave R3 slice A): CourseCopyModal's state lives in ContentTab.tsx; a pure
   * pass-through to ModulesHeaderBar, its actual opener here. */
  onCopyModalTrigger: (trigger: HTMLElement) => void;
  refreshing: boolean;
  canCopy: boolean;
}) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  const [provider] = useLlmProvider();
  const { supabase, user } = useSupabase();
  // useRubrics stays as a DIRECT call here (never moved into
  // useModulesViewOrchestration below) because useRubrics.test.ts reads this
  // exact call site's argument list as TEXT out of ModulesView.tsx.
  const rubricsHook = useRubrics(courseUrl, acronym, setNote);

  // Everything else this view used to call directly - useExportModuleAdditions,
  // the display-tree memo, repo pairing, the sticky header, selection, the
  // per-item edit/drag/add-item/syllabus/generation hooks, the cartridge
  // import/upload state, the bulk-action hooks, the current-events hook, the
  // dialogs hook and the two prop-builders that consume them - moved into
  // useModulesViewOrchestration.ts once this file crossed the repo's
  // 1000-line ceiling (docs/carry-module-pattern-forward-acceptance-
  // criteria.md's Gates section). See that file's own header comment for
  // exactly which five hook calls stay here instead (their argument lists are
  // read as source text by their own wiring tests) and why nothing else
  // needed to.
  const {
    exportAdditions,
    displayModules,
    repoMappingModules,
    repoPairing,
    headerBodyRef,
    headerHeight,
    setHeaderHeight,
    onResizeStart,
    selection,
    edits,
    dragReorder,
    newAssignmentForm,
    syllabusButtons,
    lmsGeneration,
    cartridgeUploadOpen,
    setCartridgeUploadOpen,
    cartridgeUploadTriggerRef,
    onCartridgeUploadTrigger,
    cartridgeUpload,
    onCloseCartridgeUpload,
    importCartridgeFileInputRef,
    importCartridgeBusy,
    handleImportCartridgeFileChange,
    opBusy,
    bulkModuleActions,
    bulkItemActions,
    currentEventsAssignments,
    carryModulePattern,
    carryReviewTriggerRef,
    onCarryReviewTrigger,
    courseBase,
    displayModuleMatches,
    displayItemVisible,
    dialogs,
    itemRowProps,
    addItemRowProps,
    exportAdditionsProps,
  } = useModulesViewOrchestration({
    courseUrl,
    exportCourseId,
    acronym,
    modules,
    exportModules,
    ctx,
    setModules,
    reload,
    setNote,
    setBusy,
    busy,
    targets,
    courseName,
    onEditPage,
    onPageEditorTrigger,
    provider,
    supabase,
    user,
    rubricsHook,
  });

  // The bulk-bar command box (docs/llm-command-interface-acceptance-
  // criteria.md, section 10 - THE FINAL CONTRACT). Called as a DIRECT call
  // here, not folded into useModulesViewOrchestration.ts - that file is owned
  // and concurrently edited by a sibling wave, and this chunk's own brief
  // restricts it to this file, the hook itself, the modal, the secondary-
  // modals mount, one bulk-bar section component and three test files (never
  // useModulesViewOrchestration.ts) - the same "stays a direct call site"
  // reasoning this file's own comment above gives for useRubrics. Reads
  // `selection` from the orchestration hook (already destructured above);
  // `commandInterfaceTriggerRef`/`onCommandInterfaceTrigger` below are this
  // file's own focus-restoration pair for the review modal (the modal-focus-
  // restoration pattern every other opener in this file already follows -
  // see ModulesViewSecondaryModals.tsx's own restoreFocusRef props).
  const commandInterface = useCommandInterface(
    courseUrl,
    acronym,
    provider,
    modules,
    selection.selectedItems,
    selection.selected,
    selection.selectedModules,
    selection.liveModuleIds,
    setBusy,
    setNote,
    reload
  );
  const commandInterfaceTriggerRef = useRef<HTMLElement | null>(null);
  const onCommandInterfaceTrigger = (trigger: HTMLElement) => {
    commandInterfaceTriggerRef.current = trigger;
  };

  // "Scheduled release" (docs/scheduled-publishing-from-modules-acceptance-
  // criteria.md, F6/F7/F10 - THE FINAL CONTRACT). Called as a DIRECT call
  // here, the same "stays a direct call site" reasoning this file's own
  // comment above gives for useRubrics/useCommandInterface - this chunk's
  // own brief restricts it to this file, the hook itself, the review modal,
  // the secondary-modals mount, one bulk-bar section component and three
  // test files (never useModulesViewOrchestration.ts). Reads `selection`
  // from the orchestration hook (already destructured above);
  // `scheduledReleaseTriggerRef`/`onScheduledReleaseTrigger` below are this
  // file's own focus-restoration pair for the review modal.
  const scheduledRelease = useScheduledRelease(
    courseUrl,
    acronym,
    modules,
    selection.selectedItems,
    selection.selected,
    selection.selectedModules,
    selection.liveModuleIds,
    setBusy,
    setNote,
    reload
  );
  const scheduledReleaseTriggerRef = useRef<HTMLElement | null>(null);
  const onScheduledReleaseTrigger = (trigger: HTMLElement) => {
    scheduledReleaseTriggerRef.current = trigger;
  };

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

  // "Ask AI" (docs/modules-selection-ask-ai-acceptance-criteria.md, section
  // A) - opens the AI Chatbot with the current selection loaded as context.
  // A READ, never a write (D3): owns its own busy state independently, the
  // same way `selectionDownload` above does, and never touches
  // `opBusy`/the tab-wide `busy` flag/`reload()` either - see
  // useSelectionChatContext.ts's own header comment. Threaded with the same
  // export-aware identifiers `selectionDownload` already uses
  // (`exportCourseId`, `acronym`), and the same live `modules` tree
  // `lmsGeneration`/`selectionDownload` both already read - not
  // `displayModules`, which is a mixed live/export presentation view this
  // hook's own client-side expansion (a UX pre-check only, per that file's
  // header comment) does not need.
  const selectionChatContext = useSelectionChatContext(
    courseUrl,
    exportCourseId,
    acronym,
    selection.selectedMaterialItems,
    selection.selectedModules,
    modules,
    exportModules,
    setNote
  );

  // "Visualizer coverage" (docs/visualizer-coverage-from-selection-
  // acceptance-criteria.md, Contract 4) - one scan of the current selection
  // finds concepts worth an interactive visual and checks each against the
  // visualizer app; the covered half can be linked into a Canvas module, the
  // gap half can be created as new visualizer pages. Threaded with the SAME
  // export-aware identifiers selectionDownload/selectionChatContext already
  // receive. Unlike those two reads, `link` (its Canvas-writing half) DOES
  // hold the outer `setBusy`/call `reload()` - mirrors `lmsGeneration`'s own
  // `post()`, the one other real Canvas write in this bulk bar - see
  // useVisualizerCoverage.ts's own header comment for the full read/write
  // split (`scan`/`create` never touch `setBusy`/`reload` at all).
  const visualizerCoverage = useVisualizerCoverage(
    courseUrl,
    exportCourseId,
    acronym,
    provider,
    selection.selectedMaterialItems,
    selection.selectedModules,
    modules,
    exportModules,
    setNote,
    setBusy,
    reload,
    ctx
  );

  // The bulk bar's group open/closed state (docs/bulk-bar-reorganization-
  // acceptance-criteria.md, section 3b/D1/D3). Called EXACTLY ONCE here -
  // never from inside BulkBarGroup itself, which is instantiated once per
  // group across the six section components below - see useBulkBarGroups.ts's
  // own header for why a per-instance call would clobber every sibling
  // group's persisted value. Threaded down alongside the group model and the
  // facts object below.
  const bulkBarGroupsApi = useBulkBarGroups(courseUrl);

  // The bulk bar's own consequence/visibility facts (BulkBarFacts, section
  // 3b/D1) - built ONCE here from state this component already holds, and
  // threaded down to the six section components below alongside the
  // open/closed API above (each section imports the group catalog,
  // BULK_BAR_GROUPS, directly - see bulkBarGroups.ts). Extracted into
  // buildBulkBarFacts.ts (a pure object-builder, not a hook) once this
  // chunk's wiring pushed this file over the repo's 1000-line ceiling - see
  // that file's own header for the field-by-field mapping.
  const bulkBarFacts: BulkBarFacts = buildBulkBarFacts({
    selection,
    bulkItemActions,
    bulkModuleActions,
    rubricsHook,
    lmsGeneration,
    visualizerCoverage,
    // C8: reviewVisible (not the bare reviewOpen flag) - see
    // useCarryModulePattern.ts's isCarryReviewVisible for why. A selection
    // change mid-fetch can null out the hook's template/plan while
    // reviewOpen is still true; the bar's consequence tier must drop with
    // it, exactly in step with the modal that offers the way out.
    carryReviewOpen: carryModulePattern.reviewVisible,
    // G7 (docs/llm-command-interface-acceptance-criteria.md section 10):
    // reviewVisible, not the bare reviewOpen flag - same reasoning as
    // carryReviewOpen just above, via useCommandInterface.ts's own
    // isCommandReviewVisible. This is what lets commandApplyButton (living
    // inside CommandProposalModal.tsx, never in the bar itself) be a
    // correctly-gated member of groupTier's reduction.
    commandProposalOpen: commandInterface.reviewVisible,
    // F6 (docs/scheduled-publishing-from-modules-acceptance-criteria.md):
    // reviewVisible, not the bare reviewOpen flag - same reasoning as
    // carryReviewOpen/commandProposalOpen just above, via
    // useScheduledRelease.ts's own isReleaseReviewVisible. This is what lets
    // releaseCommit (living inside ReleaseReviewModal.tsx, never in the bar
    // itself) be a correctly-gated member of groupTier's reduction.
    releaseReviewOpen: scheduledRelease.reviewVisible,
  });

  // courseBase, displayModuleMatches, displayItemVisible, dialogs and
  // itemRowProps/addItemRowProps/exportAdditionsProps all now come out of
  // useModulesViewOrchestration above - only the destructure of `dialogs`
  // itself stays inline here, since every field below is read directly by
  // this file's own JSX.
  // setEditingFile/setPreviewAssignment/onOfficeEditorTrigger/
  // onPreviewAssignmentTrigger/openFilePreview are read only by
  // buildModuleCardProps now (moved into useModulesViewOrchestration above,
  // consuming `dialogs.xxx` directly) - not re-destructured here since this
  // file's own JSX no longer references them by these bare names.
  const {
    setScheduleOpen,
    setBulkUploadOpen,
    setBulkCreateOpen,
    setRenameOpen,
    setEditingItem,
    onSchedulerTrigger,
    onBulkUploadTrigger,
    onBulkCreateTrigger,
    onRenameTrigger,
    onRubricBuilderTrigger,
    onModuleQuestionsTrigger,
    onItemQuestionsTrigger,
    onGradableEditorTrigger,
    openGeneratedPreview,
    generatedPreviewTriggerRef,
    headerFallbackRef,
    modulesListFallbackRef,
  } = dialogs;

  // The BulkModulesSection prop object (everything except `facts`/
  // `groupsState`, which stay bare identifiers at the render site below -
  // see buildBulkModulesSectionProps.ts header comment for why a full spread
  // cannot swallow those two). Extracted the same way itemRowProps,
  // addItemRowProps and exportAdditionsProps above already are.
  const bulkModulesSectionProps = buildBulkModulesSectionProps({
    opBusy,
    ctx,
    bulkModuleActions,
    targets,
    ensureTargets,
    rubricsHook,
    onModuleQuestionsTrigger,
  });

  return (
    <div className={styles.form}>
      <div className={styles.ccStickyHeader}>
        {/* headerFallbackRef (see this file's own refs block above) is
            merged onto the same node useStickyHeaderResize already tracks,
            rather than a second wrapper div - both only need to read/target
            this element, never disagree about it. */}
        <div
          className={styles.ccHeaderBody}
          ref={(el) => {
            headerBodyRef.current = el;
            headerFallbackRef.current = el;
          }}
          tabIndex={-1}
          style={headerHeight != null ? { maxHeight: headerHeight, overflowY: "auto" } : undefined}
        >
          <ModulesHeaderBar
            courseName={courseName}
            sourceContext={ctx}
            onExport={onExport}
            onImport={onImport}
            onCopyModalTrigger={onCopyModalTrigger}
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
            onBulkUploadTrigger={onBulkUploadTrigger}
            onBulkCreateTrigger={onBulkCreateTrigger}
            onRenameTrigger={onRenameTrigger}
            onSchedulerTrigger={onSchedulerTrigger}
            rubrics={rubricsHook.rubrics}
            setRubricBuilder={rubricsHook.setRubricBuilder}
            onRubricBuilderTrigger={onRubricBuilderTrigger}
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
            importCartridgeFileInputRef={importCartridgeFileInputRef}
            onImportCartridgeFileChange={handleImportCartridgeFileChange}
            importCartridgeBusy={importCartridgeBusy}
            onCartridgeUploadTrigger={onCartridgeUploadTrigger}
            onOpenCartridgeUpload={() => setCartridgeUploadOpen(true)}
          />

          {(selection.selected.size > 0 || selection.selectedModules.size > 0) && (
            <div className={styles.bulkBar}>
              {/* BulkBarHead.tsx (step-10 fixer round): extracted from this
                  file's own JSX once findings 2/4 pushed it over the repo's
                  1000-line ceiling - pure structural split, no behaviour
                  change, see that file's own header. `busy` carries ONLY the
                  shared, bar-wide `opBusy` flag - step-10 finding 4 (SECOND
                  fixer round) removed the two group-owned signals
                  (bulkAiBusy, descSharedState) that used to be OR-ed in here,
                  which made this region re-announce a fact only one group
                  owns. Each of those two signals now announces exclusively
                  from its own group's heading (BulkModulesSection.tsx's
                  "addToEach", BulkItemsSection.tsx's "content") - see
                  BulkBarGroup.tsx's announceBusy prop for the full decision. */}
              <BulkBarHead
                moduleCount={selection.selectedModules.size}
                itemCount={selection.selected.size}
                busy={opBusy}
                onClear={selection.clearSelection}
              />

              {/* AC4/D0: .bulkBarBody wraps every group section below (never
                  .bulkBarHead itself, which stays outside so count-and-Clear
                  is never scrolled away) - activates the height ceiling AND
                  the scoped .bulkBarBody .bulkLabel gutter removal
                  (page.module.css). `facts`/`groupsState` below are BARE
                  IDENTIFIERS everywhere (section 3b/D4): an arrow-function
                  prop would put a stray `>` inside the tag and truncate
                  askAiSelection.wiring.test.ts's indexOf(">") slice, failing
                  assertions against correct code. */}
              <div className={styles.bulkBarBody}>
                <GenerateFromSelectionSection
                  busy={lmsGeneration.busy}
                  generationError={lmsGeneration.generationError}
                  hasDiagLog={lmsGeneration.hasDiagLog}
                  onDownloadDiagLog={lmsGeneration.downloadDiagLog}
                  kinds={lmsGeneration.kinds}
                  onGenerate={openGeneratedPreview}
                  templates={lmsGeneration.templates}
                  templateId={lmsGeneration.templateId}
                  onTemplateChange={lmsGeneration.setTemplateId}
                  scriptLengthOptions={lmsGeneration.scriptLengthOptions}
                  scriptMinutes={lmsGeneration.scriptMinutes}
                  onScriptMinutesChange={lmsGeneration.setScriptMinutes}
                  useDiscussionCheckpoints={lmsGeneration.useDiscussionCheckpoints}
                  onUseDiscussionCheckpointsChange={lmsGeneration.setUseDiscussionCheckpoints}
                  facts={bulkBarFacts}
                  groupsState={bulkBarGroupsApi}
                />

                <DownloadSelectionSection
                  busy={selectionDownload.busy}
                  onDownload={selectionDownload.download}
                  imsccUnavailableReason={selectionDownload.imsccUnavailableReason}
                  zipUnavailableReason={selectionDownload.zipUnavailableReason}
                  facts={bulkBarFacts}
                  groupsState={bulkBarGroupsApi}
                />

                <AskAiSelectionSection
                  busy={selectionChatContext.busy}
                  onAskAi={selectionChatContext.askAi}
                  facts={bulkBarFacts}
                  groupsState={bulkBarGroupsApi}
                />

                <VisualizerCoverageSection
                  busy={visualizerCoverage.busy}
                  coverage={visualizerCoverage.coverage}
                  onScan={visualizerCoverage.scan}
                  onLink={visualizerCoverage.link}
                  onCreate={visualizerCoverage.create}
                  moduleChoice={visualizerCoverage.moduleChoice}
                  onModuleChoiceChange={visualizerCoverage.setModuleChoice}
                  moduleOptions={visualizerCoverage.moduleOptions}
                  linkUnavailableReason={visualizerCoverage.linkUnavailableReason}
                  createUnavailableReason={visualizerCoverage.createUnavailableReason}
                  linkArmed={visualizerCoverage.linkArmed}
                  createArmed={visualizerCoverage.createArmed}
                  facts={bulkBarFacts}
                  groupsState={bulkBarGroupsApi}
                />

                {/* The command box (docs/llm-command-interface-acceptance-
                    criteria.md, section 10, AC2/G15): visible whenever ANY
                    selection exists - module alone, item alone, or a mix -
                    matching Generate/Download/Ask AI/Coverage's own
                    unconditional placement here, never nested inside the
                    module- or item-gated blocks below. See
                    CommandInterfaceSection.tsx's own header for why. */}
                <CommandInterfaceSection
                  commandText={commandInterface.commandText}
                  setCommandText={commandInterface.setCommandText}
                  generateBusy={commandInterface.generateBusy}
                  onReviewCommand={commandInterface.onReviewCommand}
                  onCommandInterfaceTrigger={onCommandInterfaceTrigger}
                  facts={bulkBarFacts}
                  groupsState={bulkBarGroupsApi}
                />

                {/* Scheduled release (docs/scheduled-publishing-from-modules-
                    acceptance-criteria.md, F6/F7/F10): visible whenever ANY
                    selection exists - module alone, item alone, or a mix -
                    matching Generate/Download/Ask AI/Coverage/Command's own
                    unconditional placement here, never nested inside the
                    module- or item-gated blocks below. See
                    ScheduledReleaseSection.tsx's own header for why. */}
                <ScheduledReleaseSection
                  releaseDate={scheduledRelease.releaseDate}
                  setReleaseDate={scheduledRelease.setReleaseDate}
                  dateValidation={scheduledRelease.dateValidation}
                  reviewBusy={scheduledRelease.reviewBusy}
                  onReviewRelease={scheduledRelease.onReviewRelease}
                  onScheduledReleaseTrigger={onScheduledReleaseTrigger}
                  facts={bulkBarFacts}
                  groupsState={bulkBarGroupsApi}
                />

                {selection.selectedModules.size > 0 && (
                  <BulkModulesSection
                    {...bulkModulesSectionProps}
                    facts={bulkBarFacts}
                    groupsState={bulkBarGroupsApi}
                    confirmCurrentEvents={currentEventsAssignments.confirmCurrentEvents}
                    currentEventsLabel={currentEventsAssignments.currentEventsLabel}
                    runCurrentEventsAssignments={currentEventsAssignments.runCurrentEventsAssignments}
                    carryTemplateOptions={carryModulePattern.templateOptions}
                    carrySourceModuleId={carryModulePattern.sourceModuleId}
                    onCarrySourceModuleIdChange={carryModulePattern.setSourceModuleId}
                    carryReviewBusy={carryModulePattern.reviewBusy}
                    onReviewCarryPattern={carryModulePattern.onReviewCarryPattern}
                    onCarryReviewTrigger={onCarryReviewTrigger}
                  />
                )}

                {selection.selected.size > 0 && (
                  <BulkItemsSection
                    opBusy={opBusy}
                    sourceContext={ctx}
                    selectedItems={selection.selectedItems}
                    setEditingItem={setEditingItem}
                    onGradableEditorTrigger={onGradableEditorTrigger}
                    onEditPage={onEditPage}
                    onPageEditorTrigger={onPageEditorTrigger}
                    bulkPublish={bulkItemActions.bulkPublish}
                    descSharedState={bulkItemActions.descSharedState}
                    bulkItemsDescription={bulkItemActions.bulkItemsDescription}
                    setBulkItemsDescription={bulkItemActions.setBulkItemsDescription}
                    bulkSetDescription={bulkItemActions.bulkSetDescription}
                    bulkItemsQuestions={bulkItemActions.bulkItemsQuestions}
                    setBulkItemsQuestionsOpen={bulkItemActions.setBulkItemsQuestionsOpen}
                    onItemQuestionsTrigger={onItemQuestionsTrigger}
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
                    bulkGenerateAndAssociateRubric={bulkItemActions.bulkGenerateAndAssociateRubric}
                    bulkRubricGenerateReport={bulkItemActions.bulkRubricGenerateReport}
                    setRubricBuilder={rubricsHook.setRubricBuilder}
                    onRubricBuilderTrigger={onRubricBuilderTrigger}
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
                    facts={bulkBarFacts}
                    groupsState={bulkBarGroupsApi}
                  />
                )}
              </div>
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
          before that this panel was unreachable in export mode. See
          NewAssignmentGate.tsx for the gate itself. */}
      <NewAssignmentGate
        ctx={ctx}
        courseUrl={courseUrl}
        acronym={acronym}
        modules={modules}
        busy={busy}
        newAssignmentForm={newAssignmentForm}
      />

      {/* Repo pairing in Modules - AC9's own decision, recorded in full in
          RepoFoldersSection.tsx's header comment: a SEPARATE render region
          rather than a third DisplayModule variant merged into the module
          tree below, because ModuleCard/ModuleItemRow's write branches are
          typed around a guaranteed-present `.raw` a repo row can never have.
          selection.selected/selectedModules are the SAME Sets the module
          tree and the bulk bar below read (AC6/AC7) - this section only adds
          its own checkboxes onto them, nothing about the tree's own
          selection wiring changes. */}
      <RepoFoldersSection
        repoPairing={repoPairing}
        courseModules={repoMappingModules}
        selected={selection.selected}
        setSelected={selection.setSelected}
        selectedModules={selection.selectedModules}
        setSelectedModules={selection.setSelectedModules}
      />

      {displayModules.length === 0 && <p className={styles.emptyState}>This course has no modules yet.</p>}

      {selection.moduleSearchLc && displayModules.length > 0 && !displayModules.some(displayModuleMatches) && (
        <p className={styles.emptyState}>No modules or items match &quot;{selection.moduleSearch.trim()}&quot;.</p>
      )}

      {/* AC4 - stale additions are preserved and marked inactive, rendered here rather than dropped silently. */}
      {exportAdditions.inactive.length > 0 && (
        <p className={styles.ccHint} style={{ padding: "4px 6px" }}>
          {exportAdditions.inactive.length} added item{exportAdditions.inactive.length === 1 ? "" : "s"} no longer
          match a module in this export (kept, not deleted): {exportAdditions.inactive.map((a) => a.title).join(", ")}
        </p>
      )}

      {/* Focus-restoration fallback (this file's own refs block above) for
          every row-level opener (GradableEditorModal, FilePreviewModal,
          OfficeEditorModal, AssignmentPreviewModal) - outlives any single
          row, which unmounts on reorder/delete/search-filter/reload. The
          inline flex/gap styles reproduce styles.form's own layout for what
          used to be direct children of it, so wrapping this list changes no
          visible spacing. */}
      <div
        ref={(el) => {
          modulesListFallbackRef.current = el;
        }}
        tabIndex={-1}
        style={{ display: "flex", flexDirection: "column", gap: 20 }}
      >
        {displayModules.map((m, mi) => {
          if (!displayModuleMatches(m)) return null;
          // Export modules track their own expand/collapse locally
          // (ModuleCard - there is no numeric Canvas id for `expanded` to
          // key on), so `open`/`onToggleExpand` below are read only by the
          // live branch.
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
              exportAdditionsProps={exportAdditionsProps}
              sourceContext={ctx}
            />
          );
        })}
      </div>

      {/* Every dialog OTHER than the generated-content preview modal below -
          Scheduler, bulk upload/create/rename, both BulkQuestionsModal
          instances, GradableEditorModal, FilePreviewModal, OfficeEditorModal,
          RubricBuilderModal, AssignmentPreviewModal - extracted into
          ModulesViewSecondaryModals.tsx. GeneratedPreviewModal itself stays
          rendered directly below: generatedPreviewModal.wiring.test.ts reads
          THIS file's source text for that render site, so moving it would
          make that guard pass vacuously. */}
      <ModulesViewSecondaryModals
        courseUrl={courseUrl}
        acronym={acronym}
        courseName={courseName}
        modules={modules}
        setNote={setNote}
        reload={reload}
        dialogs={dialogs}
        rubricsHook={rubricsHook}
        bulkModuleActions={bulkModuleActions}
        bulkItemActions={bulkItemActions}
        cartridgeUploadOpen={cartridgeUploadOpen}
        cartridgeUpload={cartridgeUpload}
        cartridgeUploadTriggerRef={cartridgeUploadTriggerRef}
        onCloseCartridgeUpload={onCloseCartridgeUpload}
        carryModulePattern={carryModulePattern}
        carryReviewTriggerRef={carryReviewTriggerRef}
        commandInterface={commandInterface}
        commandInterfaceTriggerRef={commandInterfaceTriggerRef}
        scheduledRelease={scheduledRelease}
        scheduledReleaseTriggerRef={scheduledReleaseTriggerRef}
      />

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
          postTargetFromSelection={lmsGeneration.postTargetFromSelection}
          onPostModuleChoiceChange={lmsGeneration.setPostModuleChoice}
          postNewModuleName={lmsGeneration.postNewModuleName}
          onPostNewModuleNameChange={lmsGeneration.setPostNewModuleName}
          onPost={lmsGeneration.post}
          posting={lmsGeneration.posting}
          postUnavailableReason={lmsGeneration.postUnavailableReason}
          canEditText={lmsGeneration.canEditText}
          onSaveEdit={lmsGeneration.saveEdit}
          savingEdit={lmsGeneration.savingEdit}
          restoreFocusRef={generatedPreviewTriggerRef}
          fallbackFocusRefs={[headerFallbackRef]}
        />
      )}
    </div>
  );
}
