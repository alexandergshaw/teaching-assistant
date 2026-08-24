"use client";

import type React from "react";
import { useMemo, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasAddableContent, CanvasModule } from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import type { RepoModuleMappingModule } from "@/lib/repo-module-mapping";
import { canvasModulesToDisplay, cartridgeModulesToDisplay, type DisplayModule, type DisplayModuleItem } from "../display-module-tree";
import type { ContentSourceContext } from "../contentSourceGating";
import { importCourseExportFile, type ImportOutcome } from "../importCourseExportPipeline";
import { buildModuleCardProps } from "./buildModuleCardProps";
import { useAddModuleItem } from "./useAddModuleItem";
import { useBulkItemActions } from "./useBulkItemActions";
import { useBulkModuleActions } from "./useBulkModuleActions";
import { useCarryModulePattern } from "./useCarryModulePattern";
import { useCartridgeToCanvas } from "./useCartridgeToCanvas";
import { useCurrentEventsAssignments } from "./useCurrentEventsAssignments";
import { useDragReorder } from "./useDragReorder";
import { useExportModuleAdditions } from "./useExportModuleAdditions";
import { useInlineModuleEdits } from "./useInlineModuleEdits";
import { useLmsGeneration } from "./useLmsGeneration";
import { useLmsSyllabusButtons } from "./useLmsSyllabusButtons";
import { useModuleSelection } from "./useModuleSelection";
import { useModulesViewDialogs } from "./useModulesViewDialogs";
import { useNewAssignmentForm } from "./useNewAssignmentForm";
import { useRepoPairing } from "./useRepoPairing";
import { useStickyHeaderResize } from "./useStickyHeaderResize";
import { useVideoRepoPickers } from "./useVideoRepoPickers";
import type { UseRubricsReturn } from "./useRubrics";

export interface UseModulesViewOrchestrationArgs {
  courseUrl: string;
  exportCourseId?: string;
  acronym?: string;
  modules: CanvasModule[];
  exportModules?: CartridgeModule[] | null;
  ctx: ContentSourceContext;
  setModules: React.Dispatch<React.SetStateAction<CanvasModule[]>>;
  reload: () => void;
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
  setBusy: (b: boolean) => void;
  busy: boolean;
  targets: CanvasAddableContent | null;
  courseName?: string;
  onEditPage: (pageUrl: string) => void;
  onPageEditorTrigger: (trigger: HTMLElement) => void;
  provider: LlmProvider;
  supabase: SupabaseClient<Database>;
  user: User | null;
  /** Created by ModulesView's own direct `useRubrics(...)` call, which stays
   * there rather than moving in here - useRubrics.test.ts reads that call
   * site's argument list as TEXT directly out of ModulesView.tsx, so the call
   * itself must stay put even though its result (rubricsHook.rubrics/
   * setRubricBuilder) is consumed by useBulkItemActions below. */
  rubricsHook: UseRubricsReturn;
}

/**
 * Everything ModulesView.tsx used to call directly between its own
 * `useRubrics(...)` line and its JSX return - every hook whose call site is
 * NOT itself read as source text by a wiring test (docs/carry-module-pattern-
 * forward-acceptance-criteria.md's Gates section: ModulesView.tsx was at 998
 * of the repo's 1000-line ceiling and had to be split before that chunk could
 * touch it again). Five hook calls stay in ModulesView.tsx instead of moving
 * here, because their own argument lists are asserted as literal text against
 * ModulesView.tsx's source: `useRubrics` (useRubrics.test.ts), `useSelectionDownload`
 * (selection-archive.test.ts), `useSelectionChatContext` and `useVisualizerCoverage`
 * (their own wiring.test.ts files) and `useBulkBarGroups` (bulkBar.wiring.test.ts's
 * "called exactly once" count). Everything else that ModulesView only ever
 * read the RESULT of - never had its call site pinned as text - moved here
 * unchanged: same hooks, same arguments, same order, nothing new. The six
 * bulk-bar JSX render sites, the GeneratedPreviewModal render site and the
 * sticky-header structure are untouched in ModulesView.tsx itself, which is
 * what keeps every wiring test meaningful rather than vacuous - see that
 * file's own header comment on the render block for the fuller reasoning.
 *
 * `videoRepo`/`addModuleItem` are created here and consumed here (by
 * `buildModuleCardProps` below) - ModulesView.tsx never read either directly,
 * so neither is returned. Same for `setOpBusy` (only ever handed to the three
 * write-hooks below) and the two cartridge/import-only helpers
 * (`importOutcomeMessage`, `setImportCartridgeBusy`).
 */
export function useModulesViewOrchestration({
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
}: UseModulesViewOrchestrationArgs) {
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
  // like it already is into useLmsGeneration/useSelectionDownload, so
  // useRepoPairing can resolve the same row either way
  // (resolveLmsCourseRowAction for a live course, resolveLmsCourseRowByIdAction
  // for an export one).
  // M12: `acronym` - see useRepoPairing.ts's own header comment on this
  // fourth argument for the collision it closes.
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
    // already threaded into `useSelectionDownload` (ModulesView's own direct
    // call) - see this file's own `exportCourseId` argument. `ctx` (AC3) is
    // what lets `post` refuse a Canvas write for an export selection with the
    // SAME gateOperation("courseWrite") wording NewAssignmentPanel's own gate
    // uses.
    exportCourseId,
    ctx,
    acronym
  );

  // Cartridge: import (into this app) + upload (to the live Canvas course) -
  // docs/modules-cartridge-import-upload-acceptance-criteria.md.
  // ModulesHeaderBar's "Cartridge" group (AC1) triggers both; this view owns
  // every bit of state either destination needs (per this feature's own file
  // assignment), because neither can render a modal/dialog from inside the
  // sticky header (AC6) and "Import cartridge" needs no modal at all (AC3 -
  // it's a one-click file pick, exactly like syllabusTemplateFileInputRef).

  // AC15: CartridgeToCanvasModal's open/close boolean + trigger ref. NOT part
  // of useModulesViewDialogs.ts (a concurrent chunk owns that file) - kept
  // here instead, mirroring that hook's own capture-alongside-the-setter
  // shape for every other dialog in this view.
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

  // Current-events research assignment, one per selected module
  // (docs/current-events-assignment-from-modules-acceptance-criteria.md,
  // section 3b/D3-D6). Called HERE, never from BulkModulesSection - that
  // section renders only while a module is selected and can be
  // conditionally unmounted, a hook called from this view cannot be.
  // `setOpBusy` is threaded through exactly like useBulkModuleActions/
  // useBulkItemActions above, so this group's own busy state is the SAME
  // shared `opBusy` those two groups already read (see
  // useCurrentEventsAssignments.ts's own header - it holds no busy flag of
  // its own) rather than an independent signal like "addToEach"'s
  // bulkAiBusy. `selection.liveModuleIds` (not selection.selectedModules,
  // a Set<string> of discriminated keys) is the same Set<number> view
  // bulkModuleActions above already reads.
  const currentEventsAssignments = useCurrentEventsAssignments(
    courseUrl,
    acronym,
    exportCourseId,
    provider,
    modules,
    selection.liveModuleIds,
    setOpBusy,
    setNote,
    reload
  );

  // "Carry pattern forward" (docs/carry-module-pattern-forward-acceptance-
  // criteria.md, chunk D). Called HERE, never from BulkModulesSection - same
  // reasoning as currentEventsAssignments just above: that section can be
  // conditionally unmounted, a hook called from this view cannot be.
  // `selection.liveModuleIds` is the same live-only Set<number> view
  // bulkModuleActions/currentEventsAssignments already read;
  // `selection.selectedModules.size` (the FULL, mixed-source count) is
  // threaded alongside it only so the hook's own D20 refusal can name
  // whether the gap is "too few selected at all" or "mostly non-live". The
  // review modal's own opener-focus-restoration ref is created here,
  // mirroring `cartridgeUploadTriggerRef` just above (AC15's own precedent
  // for a trigger ref that is not part of useModulesViewDialogs.ts).
  const carryModulePattern = useCarryModulePattern(
    courseUrl,
    acronym,
    exportCourseId,
    provider,
    modules,
    selection.liveModuleIds,
    selection.selectedModules.size,
    setOpBusy,
    setNote,
    reload
  );
  const carryReviewTriggerRef = useRef<HTMLElement | null>(null);
  const onCarryReviewTrigger = (trigger: HTMLElement) => {
    carryReviewTriggerRef.current = trigger;
  };

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
    setPreviewAssignment: dialogs.setPreviewAssignment,
    setEditingItem: dialogs.setEditingItem,
    openFilePreview: dialogs.openFilePreview,
    setEditingFile: dialogs.setEditingFile,
    onPreviewAssignmentTrigger: dialogs.onPreviewAssignmentTrigger,
    onGradableEditorTrigger: dialogs.onGradableEditorTrigger,
    onOfficeEditorTrigger: dialogs.onOfficeEditorTrigger,
    exportAdditions,
    addModuleItem,
    videoRepo,
  });

  return {
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
  };
}
