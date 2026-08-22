"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@mui/material";
import { useLlmProvider } from "@/lib/llm-provider";
import { useSupabase } from "@/context/SupabaseProvider";
import type {
  CanvasAddableContent,
  CanvasModule,
} from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import type { RepoModuleMappingModule } from "@/lib/repo-module-mapping";
import styles from "../../page.module.css";
import { canvasModulesToDisplay, cartridgeModulesToDisplay, type DisplayModule, type DisplayModuleItem } from "./display-module-tree";
import { LIVE_CONTENT_SOURCE, type ContentSourceContext } from "./contentSourceGating";
// AC7-AC10 (docs/modules-cartridge-import-upload-acceptance-criteria.md):
// the SAME import-into-this-app pipeline ImportCourseExportControl.tsx runs,
// extracted so this view and that control share one implementation rather
// than two - see importCourseExportPipeline.ts's own header (a SEPARATE,
// concurrently-built module this file only ever calls, never inlines).
import { importCourseExportFile, type ImportOutcome } from "./importCourseExportPipeline";
import { ModuleCard } from "./modules/ModuleCard";
import { buildModuleCardProps } from "./modules/buildModuleCardProps";
import { useCartridgeToCanvas } from "./modules/useCartridgeToCanvas";
import { useExportModuleAdditions } from "./modules/useExportModuleAdditions";
import { AskAiSelectionSection } from "./modules/AskAiSelectionSection";
import { BulkItemsSection } from "./modules/BulkItemsSection";
import { BulkModulesSection } from "./modules/BulkModulesSection";
import { DownloadSelectionSection } from "./modules/DownloadSelectionSection";
import { GeneratedPreviewModal } from "./modules/GeneratedPreviewModal";
import { GenerateFromSelectionSection } from "./modules/GenerateFromSelectionSection";
import { ModulesHeaderBar } from "./modules/ModulesHeaderBar";
import { ModulesViewSecondaryModals } from "./modules/ModulesViewSecondaryModals";
import { NewAssignmentGate } from "./modules/NewAssignmentGate";
import { RepoFoldersSection } from "./modules/RepoFoldersSection";
import { useAddModuleItem } from "./modules/useAddModuleItem";
import { useBulkItemActions } from "./modules/useBulkItemActions";
import { useBulkModuleActions } from "./modules/useBulkModuleActions";
import { useDragReorder } from "./modules/useDragReorder";
import { useInlineModuleEdits } from "./modules/useInlineModuleEdits";
import { useLmsGeneration } from "./modules/useLmsGeneration";
import { useLmsSyllabusButtons } from "./modules/useLmsSyllabusButtons";
import { useModuleSelection } from "./modules/useModuleSelection";
import { useModulesViewDialogs } from "./modules/useModulesViewDialogs";
import { useNewAssignmentForm } from "./modules/useNewAssignmentForm";
import { useRepoPairing } from "./modules/useRepoPairing";
import { useRubrics } from "./modules/useRubrics";
import { useSelectionChatContext } from "./modules/useSelectionChatContext";
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
  // The module tree actually rendered below - built from whichever source is
  // active (display-module-tree.ts converts either without fabricating a
  // single Canvas-only field). `modules`/`exportModules` themselves stay
  // exactly as ContentTab fills them (live-only / export-only respectively -
  // see that component's `loadContent`), so this is the one place the two
  // are reconciled into one tree for rendering.
  // Add items to modules on an export-only course (docs/export-module-
  // additions-acceptance-criteria.md AC10) - one hook call, mirroring
  // useRepoPairing below; see that hook's own header for the activation gate.
  // M12 (docs/module-intro-video-script-acceptance-criteria.md, finding 15):
  // `acronym` is threaded through here too, mirroring useRepoPairing below -
  // both hooks already accept it (see each one's own header comment), it was
  // simply never passed from here yet, which left it dead for every
  // host-less courseUrl (the only shape CoursePicker.tsx/LmsCell.tsx emit).
  const exportAdditions = useExportModuleAdditions(courseUrl, exportCourseId, exportModules, acronym);
  const displayModules: DisplayModule[] = useMemo(
    () =>
      ctx.source === "export"
        ? cartridgeModulesToDisplay(exportModules ?? [], exportAdditions.active)
        : canvasModulesToDisplay(modules),
    [ctx.source, exportModules, modules, exportAdditions.active]
  );
  const [provider] = useLlmProvider();
  const { supabase, user } = useSupabase();

  // Repo pairing in Modules (docs/repo-pairing-in-modules-acceptance-
  // criteria.md AC1-AC4, AC9, AC10). `useRepoPairing` needs "the modules
  // currently on screen" (AC3) - the same `displayModules[]` above, reduced
  // to the minimal {id, name} shape repo-module-mapping.ts's pure matcher
  // needs (RepoModuleMappingModule) rather than the richer DisplayModule -
  // this works identically whether the active source is live Canvas or a
  // stored export, since a DisplayModule's `.id` (live) or `.identifier`
  // (export) is all a folder-to-module pairing or override ever names. A
  // module with neither is excluded rather than given a fabricated key -
  // display-module-tree.ts's own "never fabricate a value" discipline,
  // applied here.
  const repoMappingModules: RepoModuleMappingModule[] = useMemo(
    () =>
      displayModules
        .filter((m) => m.id != null || m.identifier != null)
        .map((m) => ({ id: (m.id ?? m.identifier) as string | number, name: m.name })),
    [displayModules]
  );
  // Durable repo-to-module associations
  // (docs/durable-repo-module-associations-acceptance-criteria.md): identity
  // is the course_hub ROW ID, not `courseUrl` (blank for every
  // export-sourced course) - `exportCourseId` is threaded through exactly
  // like it already is into useLmsGeneration/useSelectionDownload below, so
  // useRepoPairing can resolve the same row either way
  // (resolveLmsCourseRowAction for a live course, resolveLmsCourseRowByIdAction
  // for an export one).
  // M12: `acronym` - see useRepoPairing.ts's own header comment on this
  // fourth argument for the collision it closes. Was accepted by the hook
  // already but never actually passed from here - see this file's own
  // useLmsGeneration comment below for the fuller story of why that made the
  // mechanism dead end to end.
  const repoPairing = useRepoPairing(courseUrl, exportCourseId, repoMappingModules, acronym);

  // Resizable sticky header, module/item search + selection, rubrics, and the
  // single-item CRUD helpers (including the shared `run` write-and-reconcile
  // helper other hooks below reuse for their own one-off writes). The fourth
  // argument (AC6) is `repoPairing.repoModuleRefs` - null until a paired
  // repo's tree has actually loaded, which is exactly the "nothing to
  // confirm/refute a repo key against yet" signal pruneSelectionForModules's
  // own doc comment describes, so a repo selection is never swept before its
  // tree arrives.
  const { headerBodyRef, headerHeight, setHeaderHeight, onResizeStart } = useStickyHeaderResize();
  const selection = useModuleSelection(modules, setNote, exportModules, repoPairing.repoModuleRefs);
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
  // comment for the full rationale.
  //
  // M12 (docs/module-intro-video-script-acceptance-criteria.md, finding 15):
  // `acronym` IS now threaded through (the prior comment here - "No
  // `acronym`... resolve institution routing from the DB course row
  // themselves" - was true only for a full `https://` Canvas URL; a
  // host-less `courseUrl`, the ONLY shape CoursePicker.tsx/LmsCell.tsx ever
  // emit, has no host for the DB row lookup to key off at all once M11/M12
  // stopped `hostOf` inventing a pseudo-host from the path. Without an
  // acronym, findCourseForCanvasUrl now returns FALSE by design for that
  // shape, so this was silently dead - see this hook's own `acronym`
  // parameter doc comment for exactly which calls it now reaches, and which
  // two (refine/saveEdit's own WRITE, not their post-write version re-fetch)
  // it still does not.
  const lmsGeneration = useLmsGeneration(
    courseUrl,
    provider,
    selection.selectedMaterialItems,
    selection.selectedModules,
    modules,
    setNote,
    setBusy,
    reload,
    exportModules,
    // AC1 defect fix: threaded through exactly the way `exportCourseId` is
    // already threaded into `useSelectionDownload` below - see this file's
    // own `exportCourseId` prop doc comment. `ctx` (AC3) is what lets
    // `post` refuse a Canvas write for an export selection with the SAME
    // gateOperation("courseWrite") wording NewAssignmentPanel's own gate
    // below already uses.
    exportCourseId,
    ctx,
    acronym
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

  // ── Cartridge: import (into this app) + upload (to the live Canvas
  // course) - docs/modules-cartridge-import-upload-acceptance-criteria.md.
  // ModulesHeaderBar's new "Cartridge" group (AC1) triggers both; this view
  // owns every bit of state either destination needs (per this feature's own
  // file assignment), because neither can render a modal/dialog from inside
  // the sticky header (AC6) and "Import cartridge" needs no modal at all
  // (AC3 - it's a one-click file pick, exactly like syllabusTemplateFileInputRef
  // above).

  // AC15: CartridgeToCanvasModal's open/close boolean + trigger ref. NOT part
  // of useModulesViewDialogs.ts (a concurrent chunk owns that file) - kept
  // local here instead, mirroring that hook's own capture-alongside-the-
  // setter shape for every other dialog in this view.
  const [cartridgeUploadOpen, setCartridgeUploadOpen] = useState(false);
  const cartridgeUploadTriggerRef = useRef<HTMLElement | null>(null);
  const onCartridgeUploadTrigger = (trigger: HTMLElement) => {
    cartridgeUploadTriggerRef.current = trigger;
  };
  // AC14: the whole phase machine lives in this one hook instance - it
  // outlives the modal's own mount (the modal only renders while
  // `cartridgeUploadOpen`), which is exactly what lets `close()` below stop
  // an in-flight poll via an explicit cancelled flag rather than relying on
  // an unmount to do it implicitly.
  const cartridgeUpload = useCartridgeToCanvas(courseUrl, acronym, courseName, ctx, supabase, setNote, reload);
  const onCloseCartridgeUpload = () => {
    cartridgeUpload.close();
    setCartridgeUploadOpen(false);
  };

  // AC1/AC3: "Import cartridge" - opens the device file picker directly (no
  // intermediate modal), then runs the SAME pipeline
  // ImportCourseExportControl.tsx already ran (AC7/AC8), extracted into
  // importCourseExportPipeline.ts so the two callers share one
  // implementation. `importCartridgeBusy` drives the button's own label
  // swap in ModulesHeaderBar (AC5's native-`disabled` carve-out for a
  // transient busy state).
  const importCartridgeFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importCartridgeBusy, setImportCartridgeBusy] = useState<"" | "parsing" | "uploading">("");

  const importOutcomeMessage = (outcome: ImportOutcome): string =>
    outcome.kind === "created"
      ? `Created a new course "${outcome.courseName}" and imported the export into it.`
      : outcome.kind === "stamped"
        ? `Attached the export to your existing course "${outcome.courseName}" and linked its Canvas URL.`
        : `Attached the export to your existing course "${outcome.courseName}".`;

  const handleImportCartridgeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!picked) return;
    if (!user) {
      setNote({ kind: "error", text: "You must be logged in." });
      return;
    }
    // setState-in-effect idiom (this repo's own convention): an inline
    // async IIFE, setState only after each await - this handler is not an
    // effect, but the same rule applies to any async work kicked off from an
    // event handler that keeps setting state after awaits.
    void (async () => {
      try {
        const outcome = await importCourseExportFile(supabase, user.id, picked, (phase) => setImportCartridgeBusy(phase));
        setNote({ kind: "success", text: importOutcomeMessage(outcome) });
        // AC10: reload only when the row this import landed on IS the row
        // currently on screen - the export-selection identifier this view
        // already carries (`exportCourseId`). A live-Canvas view has no
        // course_hub row id threaded into it to compare against (ContentTab's
        // `courseId` is the CANVAS numeric course id, not a course_hub row),
        // so this can only ever fire true for an export-sourced view - which
        // is also the only case where staying silent would leave the
        // instructor staring at stale content, since a live view never
        // renders course_hub row content in the first place.
        if (exportCourseId && outcome.courseId === exportCourseId) reload();
      } catch (err) {
        setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not import the export." });
      } finally {
        setImportCartridgeBusy("");
      }
    })();
  };

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

  // Every dialog this component opens (open/close state, focus-restoration
  // refs, and the two capture-then-act handlers openFilePreview/
  // openGeneratedPreview) - extracted into useModulesViewDialogs.ts (see
  // that hook's own header comment for the full focus-restoration
  // rationale this used to carry inline here).
  const dialogs = useModulesViewDialogs(courseUrl, acronym, lmsGeneration.generate);
  const {
    setScheduleOpen,
    setBulkUploadOpen,
    setBulkCreateOpen,
    setRenameOpen,
    setEditingItem,
    setEditingFile,
    setPreviewAssignment,
    onSchedulerTrigger,
    onBulkUploadTrigger,
    onBulkCreateTrigger,
    onRenameTrigger,
    onRubricBuilderTrigger,
    onModuleQuestionsTrigger,
    onItemQuestionsTrigger,
    onGradableEditorTrigger,
    onOfficeEditorTrigger,
    onPreviewAssignmentTrigger,
    openGeneratedPreview,
    generatedPreviewTriggerRef,
    openFilePreview,
    headerFallbackRef,
    modulesListFallbackRef,
  } = dialogs;

  // Props shared by every item row / "Add item" row / export-addition row,
  // in every module - built in buildModuleCardProps.ts (module/item-specific
  // values are supplied by ModuleCard itself).
  const { itemRowProps, addItemRowProps, exportAdditionsProps } = buildModuleCardProps({
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
                onGenerate={openGeneratedPreview}
                templates={lmsGeneration.templates}
                templateId={lmsGeneration.templateId}
                onTemplateChange={lmsGeneration.setTemplateId}
                scriptLengthOptions={lmsGeneration.scriptLengthOptions}
                scriptMinutes={lmsGeneration.scriptMinutes}
                onScriptMinutesChange={lmsGeneration.setScriptMinutes}
              />

              <DownloadSelectionSection
                busy={selectionDownload.busy}
                onDownload={selectionDownload.download}
                imsccUnavailableReason={selectionDownload.imsccUnavailableReason}
                zipUnavailableReason={selectionDownload.zipUnavailableReason}
              />

              <AskAiSelectionSection busy={selectionChatContext.busy} onAskAi={selectionChatContext.askAi} />

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
                  onModuleQuestionsTrigger={onModuleQuestionsTrigger}
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


// ── Tab shell ───────────────────────────────────────────────────────────────-
