"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, IconButton, TextField, MenuItem, Checkbox, FormControlLabel, Autocomplete } from "@mui/material";
import {
  bulkAssociateRubricAction,
  bulkDeleteAction,
  bulkUpdateAction,
  createCourseAssignmentAction,
  createGradableAction,
  createModuleAction,
  createModuleItemAction,
  createPageAction,
  createQuizQuestionAction,
  deleteCourseFileAction,
  deleteModuleAction,
  deleteModuleItemAction,
  draftAssignmentDescriptionAction,
  generateDocumentTextAction,
  generateSlidesAction,
  getGradableAction,
  listAssignmentGroupsAction,
  listGithubReposAction,
  listRubricsAction,
  previewFileAction,
  requestFileUploadAction,
  revisePageWithAiAction,
  setModuleDueDatesAction,
  updateGradableAction,
  updateModuleAction,
  updateModuleItemAction,
  updatePageAction,
} from "../../actions";
import { getStoredProvider, useLlmProvider } from "@/lib/llm-provider";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildSlidesPptx } from "@/lib/pptx";
import { resolveDocumentAuthor } from "@/lib/author";
import { useSupabase } from "@/context/SupabaseProvider";
import { listRecordingFiles, downloadRecordingFile, extForFile, type RecordingFile } from "@/lib/recording-files";
import type {
  BulkKind,
  CanvasAddableContent,
  CanvasModule,
  CanvasModuleItem,
  CanvasRubric,
  GradableKind,
} from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import FilePreviewModal, { type PreviewFile } from "../FilePreviewModal";
import { DATED_TYPES, HEADER_HEIGHT_KEY, MAX_INDENT, POINTS_EDITABLE } from "./constants";
import type { EditableQuestion } from "./types";
import {
  base64ToBlobUrl,
  formatDueDate,
  itemKey,
  quizQuestionToInput,
  rowBlankClick,
  slidesToText,
  textToSlides,
  toLocalInput,
  uploadFileToModule,
} from "./utils";
import { AssignmentPreviewModal } from "./AssignmentPreviewModal";
import { BulkQuestionsModal } from "./BulkQuestionsModal";
import { BulkUploadModal } from "./BulkUploadModal";
import { GradableEditorModal } from "./GradableEditorModal";
import { ItemA11yBadge } from "./ItemA11yBadge";
import { OfficeEditorModal } from "./OfficeEditorModal";
import { PublishToggle } from "./PublishToggle";
import { RenameModulesModal } from "./RenameModulesModal";
import { RubricBuilderModal } from "./RubricBuilderModal";
import { SchedulerModal } from "./SchedulerModal";

const NEW_ASG_DEFAULT = { name: "", points: "100", due: "", stype: "online_text_entry", publish: true };

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
  // Resizable sticky header: null = natural height; a number caps the body's
  // height (it scrolls) so the module list below gets more room. Persisted.
  const headerBodyRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const n = Number(localStorage.getItem(HEADER_HEIGHT_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (headerHeight == null) localStorage.removeItem(HEADER_HEIGHT_KEY);
    else localStorage.setItem(HEADER_HEIGHT_KEY, String(Math.round(headerHeight)));
  }, [headerHeight]);
  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const body = headerBodyRef.current;
    if (!body) return;
    const top = body.getBoundingClientRect().top;
    const onMove = (ev: PointerEvent) => {
      const maxH = Math.max(120, window.innerHeight - top - 120);
      setHeaderHeight(Math.min(maxH, Math.max(48, ev.clientY - top)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const [newModuleName, setNewModuleName] = useState("");
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [naName, setNaName] = useState("");
  const [naPoints, setNaPoints] = useState("100");
  const [naDue, setNaDue] = useState("");
  const [naType, setNaType] = useState("online_text_entry");
  const [naDescription, setNaDescription] = useState("");
  const [naPublish, setNaPublish] = useState(true);
  const [naModuleId, setNaModuleId] = useState<string>("");
  const [naBusy, setNaBusy] = useState(false);
  const [naUnlock, setNaUnlock] = useState("");
  const [naLock, setNaLock] = useState("");
  const [naGrading, setNaGrading] = useState("points");
  const [naAttempts, setNaAttempts] = useState("unlimited");
  const [naExtensions, setNaExtensions] = useState("");
  const [naPeer, setNaPeer] = useState(false);
  const [naOmit, setNaOmit] = useState(false);
  const [naGroupId, setNaGroupId] = useState("");
  const [naGroups, setNaGroups] = useState<Array<{ id: number; name: string }> | null>(null);
  const [naDrafting, setNaDrafting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Filter modules by name or by a contained item's title.
  const [moduleSearch, setModuleSearch] = useState("");
  const moduleSearchLc = moduleSearch.trim().toLowerCase();
  const moduleMatches = (m: CanvasModule) =>
    !moduleSearchLc ||
    m.name.toLowerCase().includes(moduleSearchLc) ||
    m.items.some((it) => it.title.toLowerCase().includes(moduleSearchLc));
  // The modules currently shown (after the search filter). Select-all and
  // select-by-type act on these so a filtered list only selects what's visible.
  const visibleModules = modules.filter(moduleMatches);
  // Whether an item row is currently shown: no search, or the module name matched
  // (whole module shown), or the item's own title matched. Select-all and
  // select-by-type use this so they only ever touch rows on screen.
  const itemVisible = (m: CanvasModule, it: CanvasModuleItem): boolean =>
    !moduleSearchLc ||
    m.name.toLowerCase().includes(moduleSearchLc) ||
    it.title.toLowerCase().includes(moduleSearchLc);
  // The course's base URL (".../courses/123"), used to build "Open on Canvas" links.
  const courseBase = courseUrl.replace(/(\/courses\/\d+).*$/, "$1");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [uploads, setUploads] = useState<
    Record<number, Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>
  >({});
  // Per-module "add item" controls: chosen type, and the external-url / header-text inputs.
  const [addType, setAddType] = useState<Record<number, string>>({});
  const [addUrl, setAddUrl] = useState<Record<number, string>>({});
  const [addTitle, setAddTitle] = useState<Record<number, string>>({});
  // Per-module "File" creation: docx/pptx format, AI prompt, generated content.
  const [addFileFormat, setAddFileFormat] = useState<Record<number, "docx" | "pptx">>({});
  const [addFileContent, setAddFileContent] = useState<Record<number, string>>({});
  const [addAiPrompt, setAddAiPrompt] = useState<Record<number, string>>({});
  const [addAiBusy, setAddAiBusy] = useState<Record<number, boolean>>({});
  // Per-module "New Assignment" creation: name, points, due date, submission type, published.
  const [newAsg, setNewAsg] = useState<Record<number, { name: string; points: string; due: string; stype: string; publish: boolean }>>({});
  // Video picker state: which module (if any) has the picker open, and the loaded files.
  const [videoPickerModuleId, setVideoPickerModuleId] = useState<number | null>(null);
  const [videoPickerFiles, setVideoPickerFiles] = useState<RecordingFile[] | null>(null);
  const [videoPickerLoading, setVideoPickerLoading] = useState(false);
  const [videoPickerError, setVideoPickerError] = useState<string | null>(null);
  const [videoPickerBusy, setVideoPickerBusy] = useState(false);
  // Repo link picker state: which module has the picker open, owned repos list.
  const [repoPickerModuleId, setRepoPickerModuleId] = useState<number | null>(null);
  const [ownedRepos, setOwnedRepos] = useState<string[] | null>(null);
  const [repoPickerLoading, setRepoPickerLoading] = useState(false);
  const [repoPickerError, setRepoPickerError] = useState<string | null>(null);
  const [repoPickerBusy, setRepoPickerBusy] = useState(false);
  // Per-module repo link: selected repo and title.
  const [addRepoValue, setAddRepoValue] = useState<Record<number, string>>({});
  const [addRepoTitle, setAddRepoTitle] = useState<Record<number, string>>({});

  // ── Bulk selection across the module tree ──────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<number>>(new Set());
  const [rubrics, setRubrics] = useState<CanvasRubric[]>([]);
  const [opBusy, setOpBusy] = useState(false);
  const [bulkDue, setBulkDue] = useState("");
  const [bulkShift, setBulkShift] = useState(7);
  // Staggered due dates: the earliest selected module gets the base date above,
  // and each later module's items are pushed out by this interval per step.
  const [bulkStaggerOffset, setBulkStaggerOffset] = useState(1);
  const [bulkStaggerUnit, setBulkStaggerUnit] = useState<"weeks" | "days">("weeks");
  // How many modules a "Shift up/down" moves the selected items by.
  const [bulkModuleShift, setBulkModuleShift] = useState(1);
  // The module selected items are moved into by the "Move to module" control.
  const [bulkTargetModule, setBulkTargetModule] = useState<number | "">("");
  // "Add to selected modules": the content type to create in each module, and
  // the naming pattern (supports {module} and {n}) used to title each new item.
  const [bulkAddType, setBulkAddType] = useState("Assignment");
  const [bulkAddPattern, setBulkAddPattern] = useState("");
  // Optional details applied to each item created by "Add to each": a first due
  // date (staggered per module by the interval below), points, and a rubric.
  const [bulkAddDue, setBulkAddDue] = useState("");
  const [bulkAddStaggerOffset, setBulkAddStaggerOffset] = useState(1);
  const [bulkAddStaggerUnit, setBulkAddStaggerUnit] = useState<"weeks" | "days">("weeks");
  const [bulkAddPoints, setBulkAddPoints] = useState("");
  const [bulkAddRubricId, setBulkAddRubricId] = useState<number | "">("");
  // Description / page body and (for quizzes) the questions written into each
  // item that "Add to each" creates. Questions are composed in a modal.
  const [bulkAddDescription, setBulkAddDescription] = useState("");
  const [bulkAddQuestions, setBulkAddQuestions] = useState<EditableQuestion[]>([]);
  const [bulkQuestionsOpen, setBulkQuestionsOpen] = useState(false);
  // For the "File" type: an existing course file to add to each module, or AI-
  // generated content built into a new file (docx or pptx) per module.
  const [bulkAddFileId, setBulkAddFileId] = useState<number | "">("");
  const [bulkAddFileContent, setBulkAddFileContent] = useState("");
  const [bulkAddFileFormat, setBulkAddFileFormat] = useState<"docx" | "pptx">("docx");
  // Submission type for assignments created via bulk add; persisted across reloads.
  const [bulkAddSubType, setBulkAddSubType] = useState<string>(() => {
    if (typeof window === "undefined") return "online_text_entry";
    const n = localStorage.getItem("ta-modules-bulkadd-stype");
    return n && ["online_text_entry", "online_upload", "online_url", "on_paper", "none"].includes(n) ? n : "online_text_entry";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-modules-bulkadd-stype", bulkAddSubType);
  }, [bulkAddSubType]);
  // AI prompt + busy flag for generating the item's content (description/body/file).
  const [bulkAiPrompt, setBulkAiPrompt] = useState("");
  const [bulkAiBusy, setBulkAiBusy] = useState(false);
  // Editing the description / quiz questions of the items already selected.
  const [bulkItemsDescription, setBulkItemsDescription] = useState("");
  const [bulkItemsQuestions, setBulkItemsQuestions] = useState<EditableQuestion[]>([]);
  const [bulkItemsQuestionsOpen, setBulkItemsQuestionsOpen] = useState(false);
  // Whether the selected gradables share a description (loaded into the field).
  const [descSharedState, setDescSharedState] = useState<"idle" | "loading" | "same" | "mixed">("idle");
  const [bulkPoints, setBulkPoints] = useState("");
  const [bulkRubricId, setBulkRubricId] = useState<number | "">("");
  const [bulkSubType, setBulkSubType] = useState("");
  // Top-toolbar rubric picker for editing a rubric without selecting items.
  const [editRubricId, setEditRubricId] = useState<number | "">("");
  const [confirmDeleteContent, setConfirmDeleteContent] = useState(false);
  const [confirmDeleteModules, setConfirmDeleteModules] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CanvasModuleItem | null>(null);
  const [filePreview, setFilePreview] = useState<{ file: PreviewFile; blobUrl: string | null } | null>(null);
  const [editingFile, setEditingFile] = useState<CanvasModuleItem | null>(null);
  // The rubric builder's target assignments (null when closed).
  const [rubricBuilder, setRubricBuilder] = useState<{
    assignments: Array<{ id: string; title: string; points: number | null }>;
    editRubricId?: number;
  } | null>(null);
  const [drag, setDrag] = useState<{ moduleId: number; itemId: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const [dragOverModule, setDragOverModule] = useState<number | null>(null);
  // Dragging a whole module to reorder it: the grabbed module's id, and the
  // module card currently hovered as a drop target. Kept separate from the item
  // drag state above so an item drag and a module drag never trip each other.
  const [moduleDrag, setModuleDrag] = useState<number | null>(null);
  const [dragOverModuleRow, setDragOverModuleRow] = useState<number | null>(null);
  // The item whose due date is being edited inline, plus its datetime-local draft.
  const [dueEdit, setDueEdit] = useState<{ id: number; value: string } | null>(null);
  // The item whose points are being edited inline, plus its draft value.
  const [pointsEdit, setPointsEdit] = useState<{ id: number; value: string } | null>(null);
  // The assignment being previewed in a read-only modal.
  const [previewAssignment, setPreviewAssignment] = useState<CanvasModuleItem | null>(null);
  // The item whose type is being changed inline (via its type chip).
  const [typeEdit, setTypeEdit] = useState<number | null>(null);

  // FLIP animation for reorders: remember each item row's DOM node and its
  // position just before a move, then slide every moved row from its old spot to
  // its new one. Web Animations API is used (not inline styles) so it never
  // fights React's own style updates mid-animation.
  const itemNodes = useRef(new Map<number, HTMLElement | null>());
  const flipPrev = useRef<Map<number, DOMRect> | null>(null);
  // Same FLIP machinery for whole-module cards, keyed by module id.
  const moduleNodes = useRef(new Map<number, HTMLElement | null>());
  const flipPrevModules = useRef<Map<number, DOMRect> | null>(null);
  const [flipTick, setFlipTick] = useState(0);

  useLayoutEffect(() => {
    // Slide moved DOM nodes from their pre-move position to their new one. Run
    // for items and modules independently: a reorder bumps flipTick and stashes
    // a rect map for whichever kind moved.
    const animate = (
      pending: React.MutableRefObject<Map<number, DOMRect> | null>,
      nodes: React.MutableRefObject<Map<number, HTMLElement | null>>
    ) => {
      const prev = pending.current;
      if (!prev) return;
      pending.current = null;
      nodes.current.forEach((el, id) => {
        if (!el) return;
        const before = prev.get(id);
        if (!before) return;
        const after = el.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
          { duration: 230, easing: "cubic-bezier(0.2, 0, 0, 1)" }
        );
      });
    };
    animate(flipPrev, itemNodes);
    animate(flipPrevModules, moduleNodes);
  }, [flipTick]);

  // Whether an item is part of the current drag (the grabbed item, plus the rest
  // of the selection when the grabbed item is itself selected).
  const dragSelected = drag ? selected.has(itemKey(drag.moduleId, drag.itemId)) : false;
  const isDraggingItem = (moduleId: number, itemId: number) => {
    if (!drag) return false;
    if (drag.moduleId === moduleId && drag.itemId === itemId) return true;
    return dragSelected && selected.size > 1 && selected.has(itemKey(moduleId, itemId));
  };

  // Move the dragged item(s) before `beforeItemId` (or to the end when null) in
  // the target module: reorder locally for instant feedback, then persist to
  // Canvas. Dragging a selected item moves the whole selection as one block.
  const performMove = (targetModuleId: number, beforeItemId: number | null) => {
    if (!drag) return;
    const grabbedKey = itemKey(drag.moduleId, drag.itemId);
    const grabbedSelected = selected.has(grabbedKey);
    const moveKeys = grabbedSelected && selected.size > 1 ? new Set(selected) : new Set([grabbedKey]);
    setDrag(null);
    setDragOverItem(null);
    setDragOverModule(null);

    // The items to move, in their current tree order (preserves relative order).
    const moved: CanvasModuleItem[] = [];
    const movedIds = new Set<number>();
    for (const mod of modules) {
      for (const it of mod.items) {
        if (moveKeys.has(itemKey(mod.id, it.id))) {
          moved.push(it);
          movedIds.add(it.id);
        }
      }
    }
    if (moved.length === 0) return;
    if (beforeItemId != null && movedIds.has(beforeItemId)) return; // dropped onto the moving block

    // Snapshot positions for the FLIP and a diff of where everything lives now.
    const prevRects = new Map<number, DOMRect>();
    itemNodes.current.forEach((el, id) => {
      if (el) prevRects.set(id, el.getBoundingClientRect());
    });
    const oldPos = new Map<number, { moduleId: number; index: number }>();
    modules.forEach((mod) => mod.items.forEach((it, idx) => oldPos.set(it.id, { moduleId: mod.id, index: idx })));

    // New tree: pull the moved items out everywhere, then drop them as one block
    // into the target module before `beforeItemId` (or at the end).
    const next = modules.map((mod) => ({ ...mod, items: mod.items.filter((it) => !movedIds.has(it.id)) }));
    const targetModule = next.find((mod) => mod.id === targetModuleId);
    if (!targetModule) return;
    const insertIdx =
      beforeItemId == null
        ? targetModule.items.length
        : (() => {
            const bi = targetModule.items.findIndex((it) => it.id === beforeItemId);
            return bi < 0 ? targetModule.items.length : bi;
          })();
    targetModule.items.splice(insertIdx, 0, ...moved.map((it) => ({ ...it, moduleId: targetModuleId })));

    const changed = next.some((mod) =>
      mod.items.some((it, idx) => {
        const old = oldPos.get(it.id);
        return !old || old.moduleId !== mod.id || old.index !== idx;
      })
    );
    if (!changed) return; // dropped in place

    setModules(next);
    if (grabbedSelected) setSelected(new Set());
    flipPrev.current = prevRects;
    setFlipTick((t) => t + 1);

    // Persist. A single item is one call (Canvas auto-shifts the rest). For a
    // multi-item move, re-set every slot that changed in ascending target order
    // so Canvas converges on the new arrangement.
    type Update = { srcModuleId: number; itemId: number; targetModuleId: number; position: number; cross: boolean };
    let updates: Update[];
    if (moved.length === 1) {
      const only = moved[0];
      const old = oldPos.get(only.id)!;
      const finalIdx = targetModule.items.findIndex((it) => it.id === only.id);
      updates = [
        { srcModuleId: old.moduleId, itemId: only.id, targetModuleId, position: finalIdx + 1, cross: old.moduleId !== targetModuleId },
      ];
    } else {
      updates = [];
      next.forEach((mod) =>
        mod.items.forEach((it, idx) => {
          const old = oldPos.get(it.id);
          if (!old) return;
          const cross = old.moduleId !== mod.id;
          if (cross || old.index !== idx) {
            updates.push({ srcModuleId: old.moduleId, itemId: it.id, targetModuleId: mod.id, position: idx + 1, cross });
          }
        })
      );
      updates.sort((a, b) => a.targetModuleId - b.targetModuleId || a.position - b.position);
    }

    void (async () => {
      setBusy(true);
      let failed = false;
      for (const u of updates) {
        const result = await updateModuleItemAction(
          courseUrl,
          u.srcModuleId,
          u.itemId,
          { position: u.position, ...(u.cross ? { targetModuleId: u.targetModuleId } : {}) },
          acronym
        );
        if ("error" in result) failed = true;
      }
      setBusy(false);
      if (failed) {
        setNote({ kind: "error", text: "Some items could not be moved." });
        reload();
      }
    })();
  };

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

  // Reload the course's rubrics (after building a new one, so the picker shows it).
  const refreshRubrics = async () => {
    const result = await listRubricsAction(courseUrl, acronym);
    if (!("error" in result)) setRubrics(result.rubrics);
  };

  // Load the course's rubrics once for the bulk rubric-association control.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listRubricsAction(courseUrl, acronym);
      if (cancelled || "error" in result) return;
      setRubrics(result.rubrics);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym]);

  // The selected gradable items plus the data needed to pre-fill the bulk fields.
  const selGradables = (() => {
    const arr: Array<{ type: string; contentId: number; dueAt: string | null; pointsPossible: number | null }> = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        if (
          selected.has(itemKey(mod.id, it.id)) &&
          ["Assignment", "Quiz", "Discussion"].includes(it.type) &&
          typeof it.contentId === "number"
        ) {
          arr.push({ type: it.type, contentId: it.contentId, dueAt: it.dueAt, pointsPossible: it.pointsPossible });
        }
      }
    }
    return arr;
  })();
  // Sorted "kind:id" signature, so the effect only re-runs when the set changes.
  const gradableSelSig = selGradables.map((g) => `${g.type}:${g.contentId}`).sort().join("|");
  // Latest data read by the effect without widening its dependencies.
  const selGradablesRef = useRef(selGradables);
  selGradablesRef.current = selGradables;
  const rubricsRef = useRef(rubrics);
  rubricsRef.current = rubrics;

  // When the selected gradables share a deadline / points / rubric / description,
  // pre-fill the matching bulk field so the current value loads in for editing;
  // when they differ (or none is selected), clear it. Runs only when the selection
  // changes. Deadline + points come from the item data; description + rubric need
  // a fetch (run in parallel).
  useEffect(() => {
    const gradables = selGradablesRef.current;
    if (gradables.length === 0) {
      setDescSharedState("idle");
      return;
    }
    // Deadline (all gradables) and points (assignments + quizzes) from item data.
    const dueSame = gradables.every((g) => g.dueAt === gradables[0].dueAt);
    setBulkDue(dueSame && gradables[0].dueAt ? toLocalInput(gradables[0].dueAt) : "");
    const pointed = gradables.filter((g) => g.type === "Assignment" || g.type === "Quiz");
    const pointsSame = pointed.length > 0 && pointed.every((g) => g.pointsPossible === pointed[0].pointsPossible);
    setBulkPoints(pointsSame && pointed[0].pointsPossible != null ? String(pointed[0].pointsPossible) : "");

    let cancelled = false;
    setDescSharedState("loading");
    (async () => {
      const results = await Promise.all(
        gradables.map((g) => getGradableAction(courseUrl, g.type as GradableKind, g.contentId, acronym))
      );
      if (cancelled) return;
      const detailPairs = gradables
        .map((g, i) => ({ type: g.type, res: results[i] }))
        .filter((p) => !("error" in p.res))
        .map((p) => ({ type: p.type, detail: (p.res as { detail: { description: string; rubricId?: number } }).detail }));
      if (detailPairs.length === 0) {
        setDescSharedState("idle");
        return;
      }
      // Description (all gradables).
      const descs = detailPairs.map((p) => p.detail.description);
      if (descs.every((d) => d === descs[0])) {
        setBulkItemsDescription(descs[0]);
        setDescSharedState("same");
      } else {
        setBulkItemsDescription("");
        setDescSharedState("mixed");
      }
      // Rubric (assignments only): pre-fill when they all share one that exists
      // in the course's rubric list; otherwise clear.
      const assignmentRubrics = detailPairs.filter((p) => p.type === "Assignment").map((p) => p.detail.rubricId);
      const sharedRubric = assignmentRubrics[0];
      if (
        assignmentRubrics.length > 0 &&
        typeof sharedRubric === "number" &&
        assignmentRubrics.every((id) => id === sharedRubric) &&
        rubricsRef.current.some((r) => r.id === sharedRubric)
      ) {
        setBulkRubricId(sharedRubric);
      } else {
        setBulkRubricId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gradableSelSig, courseUrl, acronym]);

  const selectedItems = (): Array<{ item: CanvasModuleItem; moduleId: number }> => {
    const out: Array<{ item: CanvasModuleItem; moduleId: number }> = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        if (selected.has(itemKey(mod.id, it.id))) out.push({ item: it, moduleId: mod.id });
      }
    }
    return out;
  };
  // Only the visible (filtered) items, so "Select all items" tracks the filter.
  // Toggling merges/unmerges rather than replacing, leaving any hidden selection
  // untouched.
  const allKeys = visibleModules.flatMap((mod) =>
    mod.items.filter((it) => itemVisible(mod, it)).map((it) => itemKey(mod.id, it.id))
  );
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) for (const k of allKeys) next.delete(k);
      else for (const k of allKeys) next.add(k);
      return next;
    });
  const clearSelection = () => {
    setSelected(new Set());
    setSelectedModules(new Set());
  };
  const toggleItemSelected = (moduleId: number, itemId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = itemKey(moduleId, itemId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  // Add every item of one kind to the selection. "Graded" matches the gradable
  // types (assignments, quizzes, graded discussions); otherwise an exact type.
  const selectByKind = (kind: string) => {
    if (!kind) return;
    const matches = (it: CanvasModuleItem) => (kind === "Graded" ? DATED_TYPES.includes(it.type) : it.type === kind);
    const keys: string[] = [];
    for (const mod of visibleModules) {
      for (const it of mod.items) {
        if (matches(it) && itemVisible(mod, it)) keys.push(itemKey(mod.id, it.id));
      }
    }
    if (keys.length === 0) {
      setNote({ kind: "error", text: `No ${kind === "Graded" ? "graded items" : `${kind.toLowerCase()}s`} to select.` });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  };

  // Select (or, when all are already selected, deselect) every item in one module.
  const toggleModuleItems = (m: CanvasModule) => {
    const keys = m.items.map((it) => itemKey(m.id, it.id));
    if (keys.length === 0) return;
    const allOn = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  // Module-level selection (for deleting / publishing whole modules). Scoped to
  // the visible modules so a filtered list only selects what's on screen.
  const allModuleIds = visibleModules.map((mod) => mod.id);
  const allModulesSelected = allModuleIds.length > 0 && allModuleIds.every((id) => selectedModules.has(id));
  const toggleAllModules = () =>
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (allModulesSelected) for (const id of allModuleIds) next.delete(id);
      else for (const id of allModuleIds) next.add(id);
      return next;
    });
  const toggleModuleSelected = (id: number) =>
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkPublishModules = (published: boolean) => {
    const moduleIds = [...selectedModules];
    if (moduleIds.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of moduleIds) {
        const result = await updateModuleAction(courseUrl, id, { published }, acronym);
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `${published ? "Published" : "Unpublished"} modules: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
      });
      reload();
    })();
  };

  const bulkDeleteModules = () => {
    if (!confirmDeleteModules) {
      setConfirmDeleteModules(true);
      return;
    }
    setConfirmDeleteModules(false);
    const moduleIds = [...selectedModules];
    if (moduleIds.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of moduleIds) {
        const result = await deleteModuleAction(courseUrl, id, acronym);
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Deleted modules: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
      });
      setSelectedModules(new Set());
      reload();
    })();
  };

  // Fill a naming pattern for one module: {module} -> module name, {n} -> the
  // week/module number read from the module's title (e.g. "Week 5" -> 5, "Unit
  // 12: Foo" -> 12). Prefers a number that follows a week/module-ish word so a
  // leading year like "2024 Fall Week 3" still resolves to 3; otherwise uses the
  // first number in the title, and finally the 1-based selection index when the
  // title has no number at all.
  const fillNamePattern = (pattern: string, moduleName: string, fallbackN: number): string => {
    const labeled = moduleName.match(/(?:week|module|unit|chapter|wk|mod)\s*#?\s*(\d+)/i);
    const anyNumber = moduleName.match(/\d+/);
    const n = labeled ? labeled[1] : anyNumber ? anyNumber[0] : String(fallbackN);
    return pattern.replace(/\{module\}/g, moduleName).replace(/\{n\}/g, n).trim() || `Item ${n}`;
  };

  // Create one new item of `type` named `name` and add it to `moduleId`. Pages
  // and gradables are created first (to get a slug / content id) and then linked;
  // a SubHeader is just a titled module item with no underlying content.
  const addContentToModule = async (
    type: string,
    moduleId: number,
    name: string,
    opts?: {
      dueAt?: string | null;
      points?: number;
      rubricId?: number;
      description?: string;
      questions?: EditableQuestion[];
      fileId?: number;
      fileContent?: string;
      fileFormat?: "docx" | "pptx";
      submissionType?: string;
    }
  ): Promise<boolean> => {
    try {
      if (type === "SubHeader") {
        const r = await createModuleItemAction(courseUrl, moduleId, { type: "SubHeader", title: name }, acronym);
        return !("error" in r);
      }
      if (type === "File") {
        // AI-generated content is built into a branded .docx or .pptx and uploaded
        // as a new file; otherwise link the chosen existing course file here.
        if (opts?.fileContent && opts.fileContent.trim() !== "") {
          const author = resolveDocumentAuthor();
          if (opts.fileFormat === "pptx") {
            const deck = textToSlides(opts.fileContent);
            const buffer = await buildSlidesPptx({
              presentationTitle: deck.presentationTitle,
              slides: deck.slides,
              author,
            });
            const file = new File([buffer], `${name}.pptx`, {
              type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            });
            await uploadFileToModule(courseUrl, acronym, moduleId, file);
            return true;
          }
          const buffer = await buildDocxFromPlainText(opts.fileContent, undefined, author);
          const file = new File([buffer], `${name}.docx`, {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          await uploadFileToModule(courseUrl, acronym, moduleId, file);
          return true;
        }
        if (opts?.fileId != null) {
          const r = await createModuleItemAction(courseUrl, moduleId, { type: "File", contentId: opts.fileId }, acronym);
          return !("error" in r);
        }
        return false;
      }
      if (type === "Page") {
        const created = await createPageAction(
          courseUrl,
          { title: name, body: opts?.description || undefined },
          acronym
        );
        if ("error" in created) return false;
        const linked = await createModuleItemAction(courseUrl, moduleId, { type: "Page", pageUrl: created.page.url }, acronym);
        return !("error" in linked);
      }
      // Assignment / Quiz / Discussion: create with the optional details, link it,
      // then attach a rubric (assignments) and questions (quizzes) once it exists.
      const fields: { title: string; description?: string; pointsPossible?: number; dueAt?: string | null; submissionType?: string } = { title: name };
      if (opts?.description) fields.description = opts.description;
      if (opts?.points != null && Number.isFinite(opts.points)) fields.pointsPossible = opts.points;
      if (opts?.dueAt) fields.dueAt = opts.dueAt;
      if (opts?.submissionType && type === "Assignment") fields.submissionType = opts.submissionType;
      const created = await createGradableAction(courseUrl, type as GradableKind, fields, acronym);
      if ("error" in created) return false;
      const linked = await createModuleItemAction(courseUrl, moduleId, { type, contentId: created.id }, acronym);
      if ("error" in linked) return false;
      if (opts?.rubricId != null && type === "Assignment") {
        await bulkAssociateRubricAction(courseUrl, opts.rubricId, [String(created.id)], acronym);
      }
      if (type === "Quiz" && opts?.questions && opts.questions.length > 0) {
        for (const q of opts.questions) {
          await createQuizQuestionAction(courseUrl, created.id, quizQuestionToInput(q), acronym);
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  // Add one new item (named via the pattern) of the chosen type to every
  // selected module, in module order. New content is unpublished by default.
  const bulkAddToModules = () => {
    const targets = modules.filter((mod) => selectedModules.has(mod.id));
    if (targets.length === 0) return;
    const type = bulkAddType;
    const pattern = bulkAddPattern.trim();
    const fileId = type === "File" && bulkAddFileId !== "" ? Number(bulkAddFileId) : undefined;
    const fileContent = type === "File" && bulkAddFileContent.trim() !== "" ? bulkAddFileContent : undefined;
    if (type === "File") {
      if (fileContent === undefined && fileId === undefined) {
        setNote({ kind: "error", text: "Pick a file to add, or generate one with AI first." });
        return;
      }
      if (fileContent !== undefined && !pattern) {
        setNote({ kind: "error", text: "Enter a name pattern for the generated file." });
        return;
      }
    } else if (!pattern) {
      setNote({ kind: "error", text: "Enter a name pattern for the new items." });
      return;
    }
    const isGradable = ["Assignment", "Quiz", "Discussion"].includes(type);
    // Gather the optional details; each only applies to the types that support it.
    const points =
      ["Assignment", "Quiz"].includes(type) && bulkAddPoints.trim() !== "" && Number.isFinite(Number(bulkAddPoints))
        ? Number(bulkAddPoints)
        : undefined;
    const rubricId = type === "Assignment" && bulkAddRubricId !== "" ? Number(bulkAddRubricId) : undefined;
    const baseDue =
      isGradable && bulkAddDue && !Number.isNaN(new Date(bulkAddDue).getTime()) ? new Date(bulkAddDue) : null;
    const stepDays = Math.max(0, Math.trunc(bulkAddStaggerOffset || 0)) * (bulkAddStaggerUnit === "weeks" ? 7 : 1);
    // Description applies to pages (as the body) and gradables; questions only to quizzes.
    const description =
      ["Assignment", "Quiz", "Discussion", "Page"].includes(type) && bulkAddDescription.trim() !== ""
        ? bulkAddDescription
        : undefined;
    const questions = type === "Quiz" && bulkAddQuestions.length > 0 ? bulkAddQuestions : undefined;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let added = 0;
      let failed = 0;
      let n = 0;
      for (const mod of targets) {
        n += 1;
        // The first selected module gets the base due date; each later one is
        // pushed out by the stagger interval (0 = same date for all).
        let dueAt: string | null = null;
        if (baseDue) {
          const d = new Date(baseDue);
          d.setDate(d.getDate() + (n - 1) * stepDays);
          dueAt = d.toISOString();
        }
        const ok = await addContentToModule(type, mod.id, fillNamePattern(pattern, mod.name, n), {
          dueAt,
          points,
          rubricId,
          description,
          questions,
          fileId,
          fileContent,
          fileFormat: bulkAddFileFormat,
          submissionType: type === "Assignment" ? bulkAddSubType : undefined,
        });
        if (ok) added += 1;
        else failed += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Added to modules: ${added} done${failed ? `, ${failed} failed` : ""}.`,
      });
      reload();
    })();
  };

  // Generate the "Add to each" content with AI: an HTML description/body for
  // gradables and pages, or HTML file content when adding a File. The result fills
  // the matching field for review before the items are created.
  const bulkAiGenerate = async () => {
    if (!bulkAiPrompt.trim()) {
      setNote({ kind: "error", text: "Describe what to generate first." });
      return;
    }
    setBulkAiBusy(true);
    setNote(null);
    if (bulkAddType === "File") {
      // Files become a branded .docx or .pptx. For slides, generate a structured
      // deck and keep it as editable text; for documents, markdown-ish text.
      if (bulkAddFileFormat === "pptx") {
        const result = await generateSlidesAction(bulkAiPrompt.trim(), provider);
        setBulkAiBusy(false);
        if ("error" in result) {
          setNote({ kind: "error", text: result.error });
          return;
        }
        setBulkAddFileContent(slidesToText(result));
        setNote({ kind: "success", text: "Generated slides — review them below, then Add to build a .pptx per module." });
        return;
      }
      const result = await generateDocumentTextAction(bulkAiPrompt.trim(), provider);
      setBulkAiBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setBulkAddFileContent(result.text);
      setNote({ kind: "success", text: "Generated document text — review it below, then Add to build a .docx per module." });
      return;
    }
    // Other types take an HTML description/body.
    const instruction = `Write the full HTML body for a ${bulkAddType.toLowerCase()} in a course. ${bulkAiPrompt.trim()}`;
    const result = await revisePageWithAiAction("", instruction, provider);
    setBulkAiBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setBulkAddDescription(result.html);
    setNote({ kind: "success", text: "Generated content — review it above, then Add." });
  };

  // Run a bulk op that returns an {updated, failures} summary; report + refresh.
  const runBulkSummary = async (
    fn: () => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    const result = await fn();
    setOpBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setNote({
      kind: result.failures.length ? "error" : "success",
      text: `${label}: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
    });
    reload();
  };

  // Run a per-item op (publish, remove) over the current selection.
  const runPerItem = async (
    items: Array<{ item: CanvasModuleItem; moduleId: number }>,
    fn: (item: CanvasModuleItem, moduleId: number) => Promise<{ ok: true } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    let updated = 0;
    let failed = 0;
    for (const { item, moduleId } of items) {
      const result = await fn(item, moduleId);
      if ("error" in result) failed += 1;
      else updated += 1;
    }
    setOpBusy(false);
    setNote({
      kind: failed ? "error" : "success",
      text: `${label}: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
    });
    reload();
  };

  // Group selected items' ids by kind for the per-kind bulk endpoints.
  const idsByKind = (kinds: BulkKind[], usePageSlug = false): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const { item } of selectedItems()) {
      if (!kinds.includes(item.type as BulkKind)) continue;
      const id =
        item.type === "Page"
          ? usePageSlug
            ? item.pageUrl
            : null
          : item.contentId != null
            ? String(item.contentId)
            : null;
      if (id) (map[item.type] ??= []).push(id);
    }
    return map;
  };

  const bulkPublish = (published: boolean) => {
    const items = selectedItems();
    if (items.length === 0) return;
    void runPerItem(
      items,
      (it, moduleId) => updateModuleItemAction(courseUrl, moduleId, it.id, { published }, acronym),
      published ? "Published" : "Unpublished"
    );
  };

  const bulkSetDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a valid due date first." });
      return;
    }
    const iso = new Date(bulkDue).toISOString();
    const updates = selectedItems()
      .filter(({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number")
      .map(({ item }) => ({ type: item.type, contentId: item.contentId as number, dueAt: iso }));
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items can take a due date." });
      return;
    }
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due date set");
  };

  const bulkShiftDue = () => {
    const updates = selectedItems()
      .filter(
        ({ item }) =>
          ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number" && item.dueAt
      )
      .map(({ item }) => {
        const d = new Date(item.dueAt!);
        d.setDate(d.getDate() + bulkShift);
        return { type: item.type, contentId: item.contentId as number, dueAt: d.toISOString() };
      });
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items have a due date to shift." });
      return;
    }
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due dates shifted");
  };

  // Stagger due dates by module: the earliest selected module's gradables get the
  // base date, the next module's get base + 1 interval, the next base + 2, and so
  // on. Rank is by module list order over only the modules that have a selected
  // gradable, so gaps in the selection don't create gaps in the schedule. Items
  // in the same module share a due date.
  const bulkStaggerDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a base due date first." });
      return;
    }
    const items = selectedItems().filter(
      ({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number"
    );
    if (items.length === 0) {
      setNote({ kind: "error", text: "No selected items can take a due date." });
      return;
    }
    const perStepDays = Math.trunc(bulkStaggerOffset || 0) * (bulkStaggerUnit === "weeks" ? 7 : 1);
    const rank = new Map<number, number>();
    modules
      .filter((mod) => items.some(({ moduleId }) => moduleId === mod.id))
      .forEach((mod, idx) => rank.set(mod.id, idx));
    const base = new Date(bulkDue);
    const updates = items.map(({ item, moduleId }) => {
      const d = new Date(base);
      d.setDate(d.getDate() + (rank.get(moduleId) ?? 0) * perStepDays);
      return { type: item.type, contentId: item.contentId as number, dueAt: d.toISOString() };
    });
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due dates staggered");
  };

  // Move every selected item `dir * bulkModuleShift` modules along the module
  // list (negative = toward the top). Each item's target is clamped to the first
  // and last module, so items already at the edge in that direction stay put.
  // Items land at the end of their target module; when several move into the same
  // module their selection order is preserved.
  const bulkShiftModules = (dir: -1 | 1) => {
    const items = selectedItems();
    if (items.length === 0) return;
    const steps = Math.abs(Math.trunc(bulkModuleShift || 0));
    if (steps === 0) {
      setNote({ kind: "error", text: "Enter how many modules to shift by." });
      return;
    }
    if (modules.length < 2) {
      setNote({ kind: "error", text: "There is only one module to move items between." });
      return;
    }
    const delta = dir * steps;

    const moduleIndex = new Map<number, number>();
    modules.forEach((mod, idx) => moduleIndex.set(mod.id, idx));

    // Plan each move: source module + target module + the 1-based position the
    // item should take at the end of that target (accounting for others moving
    // into the same module ahead of it in this batch).
    const appended = new Map<number, number>();
    const plan = new Map<number, { srcModuleId: number; targetModuleId: number; position: number }>();
    for (const { item, moduleId } of items) {
      const srcIdx = moduleIndex.get(moduleId);
      if (srcIdx === undefined) continue;
      const targetIdx = Math.min(modules.length - 1, Math.max(0, srcIdx + delta));
      if (targetIdx === srcIdx) continue; // already at the top/bottom in this direction
      const target = modules[targetIdx];
      const n = appended.get(target.id) ?? 0;
      plan.set(item.id, { srcModuleId: moduleId, targetModuleId: target.id, position: target.items.length + n + 1 });
      appended.set(target.id, n + 1);
    }

    const moveItems = items.filter(({ item }) => plan.has(item.id));
    if (moveItems.length === 0) {
      setNote({ kind: "error", text: `Selected items are already at the ${dir < 0 ? "top" : "bottom"} module.` });
      return;
    }

    void (async () => {
      await runPerItem(
        moveItems,
        (it, moduleId) => {
          const p = plan.get(it.id)!;
          return updateModuleItemAction(
            courseUrl,
            moduleId,
            it.id,
            { targetModuleId: p.targetModuleId, position: p.position },
            acronym
          );
        },
        dir < 0 ? "Shifted up" : "Shifted down"
      );
      clearSelection();
    })();
  };

  // Move every selected item into one chosen module, appended to its end in
  // selection order. Items already in that module are left alone.
  const bulkMoveToModule = () => {
    if (bulkTargetModule === "") {
      setNote({ kind: "error", text: "Pick a module to move the items into." });
      return;
    }
    const targetId = bulkTargetModule;
    const target = modules.find((mod) => mod.id === targetId);
    if (!target) return;
    const items = selectedItems();
    if (items.length === 0) return;

    // Position each moved item at the end of the target, after any already there
    // plus the others moving in ahead of it in this batch.
    let appended = 0;
    const plan = new Map<number, number>();
    for (const { item, moduleId } of items) {
      if (moduleId === targetId) continue; // already in the target module
      plan.set(item.id, target.items.length + appended + 1);
      appended += 1;
    }

    const moveItems = items.filter(({ item }) => plan.has(item.id));
    if (moveItems.length === 0) {
      setNote({ kind: "error", text: `Selected items are already in "${target.name}".` });
      return;
    }

    void (async () => {
      await runPerItem(
        moveItems,
        (it, moduleId) =>
          updateModuleItemAction(
            courseUrl,
            moduleId,
            it.id,
            { targetModuleId: targetId, position: plan.get(it.id)! },
            acronym
          ),
        `Moved to "${target.name}"`
      );
      clearSelection();
    })();
  };

  const bulkSetPoints = () => {
    const p = Number(bulkPoints);
    if (bulkPoints.trim() === "" || !Number.isFinite(p)) {
      setNote({ kind: "error", text: "Enter a points value." });
      return;
    }
    const byKind = idsByKind(["Assignment", "Quiz"]);
    const kinds = Object.keys(byKind);
    if (kinds.length === 0) {
      setNote({ kind: "error", text: "No selected assignments or quizzes." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const k of kinds) {
        const result = await bulkUpdateAction(courseUrl, k as BulkKind, byKind[k], { pointsPossible: p }, acronym);
        if ("error" in result) failed += byKind[k].length;
        else {
          updated += result.updated;
          failed += result.failures.length;
        }
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Points set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  const bulkRubric = () => {
    if (bulkRubricId === "") {
      setNote({ kind: "error", text: "Pick a rubric first." });
      return;
    }
    const ids = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => String(item.contentId));
    if (ids.length === 0) {
      setNote({ kind: "error", text: "No selected assignments." });
      return;
    }
    void runBulkSummary(() => bulkAssociateRubricAction(courseUrl, Number(bulkRubricId), ids, acronym), "Rubric associated");
  };

  // Open the rubric builder, pre-targeting the selected assignments to associate.
  const openRubricBuilder = () => {
    const assignments = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => ({ id: String(item.contentId), title: item.title, points: item.pointsPossible }));
    setRubricBuilder({ assignments });
  };

  // Count the number of selected assignment items.
  const selectedAssignmentCount = (): number => {
    return selectedItems().filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number").length;
  };

  // Update submission type on all selected assignments.
  const bulkUpdateSubmissionType = () => {
    if (bulkSubType === "") {
      setNote({ kind: "error", text: "Pick a submission type first." });
      return;
    }
    const ids = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => String(item.contentId));
    if (ids.length === 0) {
      setNote({ kind: "error", text: "No selected assignments." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      const result = await bulkUpdateAction(courseUrl, "Assignment", ids, { submissionType: bulkSubType }, acronym);
      setOpBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      const failed = result.failures.length;
      setNote({
        kind: failed > 0 ? "error" : "success",
        text: `Submission type updated on ${result.updated} assignment${result.updated === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}`,
      });
      reload();
    })();
  };

  // Replace the description on every selected gradable, and the body on selected
  // pages, with the text from the bulk "Content" field.
  const bulkSetDescription = () => {
    if (bulkItemsDescription.trim() === "") {
      setNote({ kind: "error", text: "Type a description to set (this replaces the existing one)." });
      return;
    }
    const items = selectedItems();
    const gradables = items.filter(
      ({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number"
    );
    const pages = items.filter(({ item }) => item.type === "Page" && item.pageUrl);
    if (gradables.length === 0 && pages.length === 0) {
      setNote({ kind: "error", text: "No selected items have a description to set." });
      return;
    }
    const desc = bulkItemsDescription;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const { item } of gradables) {
        const r = await updateGradableAction(courseUrl, item.type as GradableKind, item.contentId as number, { description: desc }, acronym);
        if ("error" in r) failed += 1;
        else updated += 1;
      }
      for (const { item } of pages) {
        const r = await updatePageAction(courseUrl, item.pageUrl as string, { body: desc }, acronym);
        if ("error" in r) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Description set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  // Append the composed questions to every selected quiz.
  const bulkAddQuestionsToQuizzes = () => {
    if (bulkItemsQuestions.length === 0) {
      setNote({ kind: "error", text: "Add at least one question first." });
      return;
    }
    const quizzes = selectedItems().filter(({ item }) => item.type === "Quiz" && typeof item.contentId === "number");
    if (quizzes.length === 0) {
      setNote({ kind: "error", text: "No selected quizzes." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let added = 0;
      let failed = 0;
      for (const { item } of quizzes) {
        for (const q of bulkItemsQuestions) {
          const r = await createQuizQuestionAction(courseUrl, item.contentId as number, quizQuestionToInput(q), acronym);
          if ("error" in r) failed += 1;
          else added += 1;
        }
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Questions added: ${added} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  const bulkRemoveFromModule = () => {
    const items = selectedItems();
    if (items.length === 0) return;
    void (async () => {
      await runPerItem(items, (it, moduleId) => deleteModuleItemAction(courseUrl, moduleId, it.id, acronym), "Removed from module");
      clearSelection();
    })();
  };

  const bulkDeleteContent = () => {
    if (!confirmDeleteContent) {
      setConfirmDeleteContent(true);
      return;
    }
    setConfirmDeleteContent(false);
    const items = selectedItems();
    // Assignments/quizzes/discussions/pages go through the per-kind bulk endpoint;
    // files have their own delete; text headers and external URLs only exist as
    // module items, so removing the item is the only "delete" there is.
    const byKind = idsByKind(["Assignment", "Quiz", "Discussion", "Page"], true);
    const kinds = Object.keys(byKind);
    const fileIds = items
      .filter(({ item }) => item.type === "File" && typeof item.contentId === "number")
      .map(({ item }) => item.contentId as number);
    const moduleOnly = items.filter(({ item }) =>
      ["SubHeader", "ExternalUrl", "ExternalTool"].includes(item.type)
    );
    if (kinds.length === 0 && fileIds.length === 0 && moduleOnly.length === 0) {
      setNote({ kind: "error", text: "No selected items can be deleted from Canvas (try Remove from module)." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let deleted = 0;
      let failed = 0;
      for (const k of kinds) {
        const result = await bulkDeleteAction(courseUrl, k as BulkKind, byKind[k], acronym);
        if ("error" in result) failed += byKind[k].length;
        else {
          deleted += result.updated;
          failed += result.failures.length;
        }
      }
      for (const fileId of fileIds) {
        const result = await deleteCourseFileAction(courseUrl, fileId, acronym);
        if ("error" in result) failed += 1;
        else deleted += 1;
      }
      for (const { item, moduleId } of moduleOnly) {
        const result = await deleteModuleItemAction(courseUrl, moduleId, item.id, acronym);
        if ("error" in result) failed += 1;
        else deleted += 1;
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Deleted from Canvas: ${deleted} done${failed ? `, ${failed} failed` : ""}.` });
      clearSelection();
      reload();
    })();
  };

  const patchModule = (id: number, patch: Partial<CanvasModule>) =>
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const patchItems = (moduleId: number, items: CanvasModuleItem[]) =>
    setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, items } : m)));

  // Run a write, surfacing errors and reloading from Canvas to recover on failure.
  const run = async (fn: () => Promise<{ error: string } | unknown>, fallbackMsg: string) => {
    setBusy(true);
    setNote(null);
    try {
      const result = (await fn()) as { error?: string };
      if (result && typeof result === "object" && "error" in result && result.error) {
        setNote({ kind: "error", text: result.error });
        reload();
      }
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : fallbackMsg });
      reload();
    } finally {
      setBusy(false);
    }
  };

  const handleAddModule = async () => {
    const name = newModuleName.trim();
    if (!name) return;
    setNewModuleName("");
    await run(
      () => createModuleAction(courseUrl, name, modules.length + 1, acronym),
      "Could not create the module."
    );
    reload();
  };

  const handleCreateAssignment = async () => {
    if (!naName.trim()) return;
    setNaBusy(true);
    const r = await createCourseAssignmentAction(
      courseUrl,
      {
        name: naName,
        description: naDescription,
        pointsPossible: naPoints.trim() ? Number(naPoints) : null,
        dueAt: naDue,
        submissionType: naType,
        published: naPublish,
        unlockAt: naUnlock,
        lockAt: naLock,
        gradingType: naGrading,
        allowedAttempts: naAttempts === "unlimited" ? -1 : Number(naAttempts),
        allowedExtensions: naType === "online_upload" ? naExtensions : "",
        peerReviews: naPeer,
        omitFromFinalGrade: naOmit,
        assignmentGroupId: naGroupId ? Number(naGroupId) : null,
      },
      naModuleId ? Number(naModuleId) : null,
      acronym
    );
    setNaBusy(false);
    if ("error" in r) {
      setNote({ kind: "error", text: r.error });
      return;
    }
    setNote({ kind: "success", text: `Created "${r.name}"${r.addedToModule ? " and added it to the module" : ""}.` });
    setShowNewAssignment(false);
    setNaName("");
    setNaDescription("");
    setNaDue("");
    setNaUnlock("");
    setNaLock("");
    setNaGrading("points");
    setNaAttempts("unlimited");
    setNaExtensions("");
    setNaPeer(false);
    setNaOmit(false);
    setNaGroupId("");
    reload();
  };

  const handleDraftDescription = async () => {
    setNaDrafting(true);
    const r = await draftAssignmentDescriptionAction(naName, naDescription, getStoredProvider());
    setNaDrafting(false);
    if ("error" in r) {
      setNote({ kind: "error", text: r.error });
      return;
    }
    setNaDescription(r.text);
  };

  const saveModuleName = async (m: CanvasModule) => {
    const draft = drafts[`m${m.id}`];
    if (draft === undefined || draft.trim() === m.name) return;
    const name = draft.trim();
    if (!name) return;
    patchModule(m.id, { name });
    await run(() => updateModuleAction(courseUrl, m.id, { name }, acronym), "Could not rename the module.");
  };

  const toggleModule = (m: CanvasModule) => {
    const published = !m.published;
    patchModule(m.id, { published });
    void run(
      () => updateModuleAction(courseUrl, m.id, { published }, acronym),
      "Could not update the module."
    );
  };

  const moveModule = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= modules.length) return;
    const reordered = [...modules];
    const [m] = reordered.splice(index, 1);
    reordered.splice(target, 0, m);
    setModules(reordered);
    void run(
      () => updateModuleAction(courseUrl, m.id, { position: target + 1 }, acronym),
      "Could not reorder the module."
    );
  };

  // Drop the dragged module onto another module's card: drag down lands it just
  // after the target, drag up lands it just before, so either end is reachable.
  // Reorder locally with a FLIP for instant feedback, then persist the new
  // 1-based position (Canvas shifts the rest).
  const performModuleMove = (targetId: number) => {
    if (moduleDrag === null) return;
    const srcId = moduleDrag;
    setModuleDrag(null);
    setDragOverModuleRow(null);
    if (srcId === targetId) return;

    const srcIdx = modules.findIndex((m) => m.id === srcId);
    const tgtIdx = modules.findIndex((m) => m.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const prevRects = new Map<number, DOMRect>();
    moduleNodes.current.forEach((el, id) => {
      if (el) prevRects.set(id, el.getBoundingClientRect());
    });

    const dragged = modules[srcIdx];
    const reordered = modules.filter((m) => m.id !== srcId);
    const newTgtIdx = reordered.findIndex((m) => m.id === targetId);
    const insertAt = srcIdx < tgtIdx ? newTgtIdx + 1 : newTgtIdx;
    reordered.splice(insertAt, 0, dragged);

    setModules(reordered);
    flipPrevModules.current = prevRects;
    setFlipTick((t) => t + 1);

    void run(
      () => updateModuleAction(courseUrl, dragged.id, { position: insertAt + 1 }, acronym),
      "Could not reorder the module."
    );
  };

  const removeModule = async (m: CanvasModule) => {
    if (confirmId !== `m${m.id}`) {
      setConfirmId(`m${m.id}`);
      return;
    }
    setConfirmId(null);
    setModules((prev) => prev.filter((x) => x.id !== m.id));
    await run(() => deleteModuleAction(courseUrl, m.id, acronym), "Could not delete the module.");
  };

  const saveItemTitle = async (m: CanvasModule, it: CanvasModuleItem) => {
    const draft = drafts[`i${it.id}`];
    if (draft === undefined || draft.trim() === it.title) return;
    const title = draft.trim();
    if (!title) return;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, title } : x)));
    await run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { title }, acronym),
      "Could not rename the item."
    );
  };

  // Persist an inline due-date edit for one gradable item. Empty clears the date.
  // Skips the write when the field is unchanged; optimistic, then reconciles.
  const saveDueEdit = (m: CanvasModule, it: CanvasModuleItem) => {
    if (!dueEdit || dueEdit.id !== it.id) return;
    if (dueEdit.value === toLocalInput(it.dueAt) || it.contentId == null) {
      setDueEdit(null);
      return;
    }
    const raw = dueEdit.value.trim();
    if (raw && Number.isNaN(new Date(raw).getTime())) {
      setNote({ kind: "error", text: "Could not read that due date." });
      setDueEdit(null);
      return;
    }
    const iso = raw ? new Date(raw).toISOString() : null;
    const contentId = it.contentId;
    setDueEdit(null);
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, dueAt: iso } : x)));
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await setModuleDueDatesAction(
        courseUrl,
        [{ type: it.type, contentId, dueAt: iso }],
        acronym
      );
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        reload();
      } else if (result.failures.length > 0) {
        setNote({ kind: "error", text: "Could not update the due date in Canvas." });
        reload();
      } else {
        setNote({ kind: "success", text: iso ? "Due date updated." : "Due date cleared." });
      }
    })();
  };

  // Persist an inline points edit for an assignment/quiz. Skips an unchanged or
  // empty value; optimistic, then reconciles on failure.
  const savePointsEdit = (m: CanvasModule, it: CanvasModuleItem) => {
    if (!pointsEdit || pointsEdit.id !== it.id) return;
    const original = it.pointsPossible != null ? String(it.pointsPossible) : "";
    const raw = pointsEdit.value.trim();
    if (raw === original || it.contentId == null) {
      setPointsEdit(null);
      return;
    }
    if (raw === "" || !Number.isFinite(Number(raw))) {
      setNote({ kind: "error", text: "Enter a number for the points." });
      setPointsEdit(null);
      return;
    }
    const pts = Number(raw);
    const contentId = it.contentId;
    setPointsEdit(null);
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, pointsPossible: pts } : x)));
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await updateGradableAction(courseUrl, it.type as GradableKind, contentId, { pointsPossible: pts }, acronym);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        reload();
      } else {
        setNote({ kind: "success", text: "Points updated." });
      }
    })();
  };

  // Change a gradable item's type from its row: recreate it as the target kind
  // (carrying title, description, points, due date), drop it into the same slot,
  // and delete the original. Submissions/grades do not carry over.
  const changeItemType = (m: CanvasModule, it: CanvasModuleItem, target: GradableKind) => {
    setTypeEdit(null);
    if (it.contentId == null || target === it.type) return;
    const contentId = it.contentId;
    void (async () => {
      setBusy(true);
      setNote(null);
      try {
        let description = "";
        const detail = await getGradableAction(courseUrl, it.type as GradableKind, contentId, acronym);
        if (!("error" in detail)) description = detail.detail.description;
        const created = await createGradableAction(
          courseUrl,
          target,
          { title: it.title, description, pointsPossible: it.pointsPossible ?? undefined, dueAt: it.dueAt },
          acronym
        );
        if ("error" in created) throw new Error(created.error);
        const added = await createModuleItemAction(
          courseUrl,
          m.id,
          { type: target, contentId: created.id, position: it.position, indent: it.indent },
          acronym
        );
        if ("error" in added) throw new Error(added.error);
        const removed = await bulkDeleteAction(courseUrl, it.type as BulkKind, [String(contentId)], acronym);
        if ("error" in removed) throw new Error(removed.error);
        setNote({ kind: "success", text: `Changed to ${target.toLowerCase()}.` });
      } catch (err) {
        setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not change the type." });
      } finally {
        setBusy(false);
        reload();
      }
    })();
  };

  const toggleItem = (m: CanvasModule, it: CanvasModuleItem) => {
    const published = !it.published;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, published } : x)));
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { published }, acronym),
      "Could not update the item."
    );
  };

  const moveItem = (m: CanvasModule, index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= m.items.length) return;
    const items = [...m.items];
    const [it] = items.splice(index, 1);
    items.splice(target, 0, it);
    patchItems(m.id, items);
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { position: target + 1 }, acronym),
      "Could not reorder the item."
    );
  };

  const indentItem = (m: CanvasModule, it: CanvasModuleItem, delta: -1 | 1) => {
    const indent = Math.min(MAX_INDENT, Math.max(0, it.indent + delta));
    if (indent === it.indent) return;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, indent } : x)));
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { indent }, acronym),
      "Could not change the indent."
    );
  };

  const removeItem = async (m: CanvasModule, it: CanvasModuleItem) => {
    if (confirmId !== `i${it.id}`) {
      setConfirmId(`i${it.id}`);
      return;
    }
    setConfirmId(null);
    patchItems(m.id, m.items.filter((x) => x.id !== it.id));
    await run(
      () => deleteModuleItemAction(courseUrl, m.id, it.id, acronym),
      "Could not remove the item."
    );
  };

  // For bulk operations: get list of existing files.
  const bulkFileOptions = (): Array<{ value: string; label: string }> => {
    if (!targets) return [];
    return targets.files.map((f) => ({ value: String(f.id), label: f.title }));
  };

  const asgOf = (id: number) => newAsg[id] ?? NEW_ASG_DEFAULT;
  const patchAsg = (id: number, patch: Partial<typeof NEW_ASG_DEFAULT>) =>
    setNewAsg((p) => ({ ...p, [id]: { ...asgOf(id), ...patch } }));

  const canAdd = (m: CanvasModule): boolean => {
    const type = addType[m.id] ?? "NewAssignment";
    if (type === "NewAssignment") return !!asgOf(m.id).name.trim();
    if (type === "ExternalUrl") return !!(addUrl[m.id] ?? "").trim();
    if (type === "SubHeader") return !!(addTitle[m.id] ?? "").trim();
    if (type === "File") return (addFileContent[m.id] ?? "").trim() !== "";
    if (type === "VideoLibrary") return false;
    if (type === "RepoLink") return false;
    return false;
  };

  // A file name derived from the generated content's first heading/line.
  const titleFromText = (text: string): string => {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.match(/^#{1,2}\s+(.*)$/);
      return ((h ? h[1] : line).trim() || "Document").slice(0, 80);
    }
    return "Document";
  };

  // Generate the per-module file's content with AI (docx text or a slide deck).
  const addAiGenerate = async (m: CanvasModule) => {
    const prompt = (addAiPrompt[m.id] ?? "").trim();
    if (!prompt) {
      setNote({ kind: "error", text: "Describe what to generate first." });
      return;
    }
    const format = addFileFormat[m.id] ?? "docx";
    setAddAiBusy((p) => ({ ...p, [m.id]: true }));
    setNote(null);
    if (format === "pptx") {
      const result = await generateSlidesAction(prompt, provider);
      setAddAiBusy((p) => ({ ...p, [m.id]: false }));
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setAddFileContent((p) => ({ ...p, [m.id]: slidesToText(result) }));
      setNote({ kind: "success", text: "Generated slides — review them, then Add." });
      return;
    }
    const result = await generateDocumentTextAction(prompt, provider);
    setAddAiBusy((p) => ({ ...p, [m.id]: false }));
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setAddFileContent((p) => ({ ...p, [m.id]: result.text }));
    setNote({ kind: "success", text: "Generated document — review it, then Add." });
  };

  const addItem = async (m: CanvasModule) => {
    const type = addType[m.id] ?? "NewAssignment";
    if (type === "NewAssignment") {
      const a = asgOf(m.id);
      setBusy(true);
      setNote(null);
      const r = await createCourseAssignmentAction(
        courseUrl,
        { name: a.name, description: "", pointsPossible: a.points.trim() ? Number(a.points) : null, dueAt: a.due, submissionType: a.stype, published: a.publish },
        m.id,
        acronym
      );
      setBusy(false);
      if ("error" in r) { setNote({ kind: "error", text: r.error }); return; }
      setNote({ kind: "success", text: `Created "${r.name}" in ${m.name}.` });
      setNewAsg((p) => ({ ...p, [m.id]: { ...NEW_ASG_DEFAULT } }));
      reload();
      return;
    }
    // AI-generated file: build a .docx/.pptx and upload it into this module.
    if (type === "File" && (addFileContent[m.id] ?? "").trim() !== "") {
      const content = addFileContent[m.id];
      const format = addFileFormat[m.id] ?? "docx";
      setBusy(true);
      setNote(null);
      const ok = await addContentToModule("File", m.id, titleFromText(content), {
        fileContent: content,
        fileFormat: format,
      });
      setBusy(false);
      if (!ok) {
        setNote({ kind: "error", text: "Could not generate and add the file." });
        return;
      }
      setAddFileContent((p) => ({ ...p, [m.id]: "" }));
      setAddAiPrompt((p) => ({ ...p, [m.id]: "" }));
      setNote({ kind: "success", text: `Added the generated .${format} to "${m.name}".` });
      reload();
      return;
    }
    if (type === "ExternalUrl") {
      const externalUrl = (addUrl[m.id] ?? "").trim();
      const title = (addTitle[m.id] ?? "").trim();
      if (!externalUrl) return;
      setAddUrl((p) => ({ ...p, [m.id]: "" }));
      setAddTitle((p) => ({ ...p, [m.id]: "" }));
      await run(() => createModuleItemAction(courseUrl, m.id, { type: "ExternalUrl", externalUrl, title: title || externalUrl }, acronym), "Could not add the item.");
      reload();
      return;
    }
    if (type === "SubHeader") {
      const title = (addTitle[m.id] ?? "").trim();
      if (!title) return;
      setAddTitle((p) => ({ ...p, [m.id]: "" }));
      await run(() => createModuleItemAction(courseUrl, m.id, { type: "SubHeader", title }, acronym), "Could not add the item.");
      reload();
      return;
    }
  };

  // Upload dropped/picked files straight into a module, tracking each file's
  // status, then refresh so the new File items appear.
  const handleModuleFiles = async (m: CanvasModule, list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setUploads((u) => ({ ...u, [m.id]: arr.map((f) => ({ name: f.name, status: "uploading" as const })) }));
    for (let i = 0; i < arr.length; i++) {
      try {
        await uploadFileToModule(courseUrl, acronym, m.id, arr[i]);
        setUploads((u) => ({
          ...u,
          [m.id]: (u[m.id] ?? []).map((row, idx) => (idx === i ? { ...row, status: "done" } : row)),
        }));
      } catch (err) {
        setUploads((u) => ({
          ...u,
          [m.id]: (u[m.id] ?? []).map((row, idx) =>
            idx === i ? { ...row, status: "error", error: err instanceof Error ? err.message : "Failed" } : row
          ),
        }));
      }
    }
    reload();
  };

  // Open the video picker for a module, loading files from the library.
  const openVideoPicker = async (m: CanvasModule) => {
    if (!user) {
      setVideoPickerError("Sign in to use the library.");
      return;
    }
    setVideoPickerModuleId(m.id);
    setVideoPickerFiles(null);
    setVideoPickerError(null);
    setVideoPickerLoading(true);
    try {
      const files = await listRecordingFiles(supabase, user.id);
      setVideoPickerFiles(files);
      if (files.length === 0) {
        setVideoPickerError("No saved videos yet - record something on the Recording tab.");
      }
    } catch (err) {
      setVideoPickerError(err instanceof Error ? err.message : "Failed to load library");
    } finally {
      setVideoPickerLoading(false);
    }
  };

  // Close the video picker.
  const closeVideoPicker = () => {
    setVideoPickerModuleId(null);
    setVideoPickerFiles(null);
    setVideoPickerError(null);
  };

  // Open the repo picker for a module, loading owned repos.
  const openRepoPicker = async (m: CanvasModule) => {
    setRepoPickerModuleId(m.id);
    setOwnedRepos(null);
    setRepoPickerError(null);
    setRepoPickerLoading(true);
    try {
      const r = await listGithubReposAction();
      if ("error" in r) {
        setRepoPickerError(r.error);
        setRepoPickerLoading(false);
        return;
      }
      const sorted = r.repos.map((repo) => repo.fullName).sort();
      setOwnedRepos(sorted);
      if (sorted.length === 0) {
        setRepoPickerError("No repositories found. Create one on GitHub.");
      }
    } catch (err) {
      setRepoPickerError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setRepoPickerLoading(false);
    }
  };

  // Close the repo picker.
  const closeRepoPicker = () => {
    setRepoPickerModuleId(null);
    setOwnedRepos(null);
    setRepoPickerError(null);
  };

  // Add a repo link to a module.
  const addRepoLink = async (m: CanvasModule) => {
    const repoValue = (addRepoValue[m.id] ?? "").trim();
    const title = (addRepoTitle[m.id] ?? "").trim() || repoValue;
    if (!repoValue || !repoValue.match(/^[^/\s]+\/[^/\s]+$/)) {
      setNote({ kind: "error", text: "Please enter a valid repository in owner/name format" });
      return;
    }
    setRepoPickerBusy(true);
    setNote(null);
    try {
      const result = await createModuleItemAction(
        courseUrl,
        m.id,
        {
          type: "ExternalUrl",
          externalUrl: `https://github.com/${repoValue}`,
          title,
        },
        acronym
      );
      if ("error" in result) throw new Error(result.error);
      setNote({ kind: "success", text: `Added repo link: ${title}` });
      setAddRepoValue((p) => ({ ...p, [m.id]: "" }));
      setAddRepoTitle((p) => ({ ...p, [m.id]: "" }));
      closeRepoPicker();
      reload();
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Failed to add repo link" });
    } finally {
      setRepoPickerBusy(false);
    }
  };

  // Add a video from the library to a module.
  const addVideoFromLibrary = async (m: CanvasModule, file: RecordingFile) => {
    setVideoPickerBusy(true);
    setNote(null);
    try {
      const blob = await downloadRecordingFile(supabase, file);
      const fileName = `${file.name.replace(/[^a-z0-9 _-]/gi, "_")}.${extForFile(file)}`;

      const ticket = await requestFileUploadAction(
        courseUrl,
        {
          name: fileName,
          size: blob.size,
          contentType: file.mimeType,
          folderPath: "uploads",
        },
        acronym
      );

      if ("error" in ticket) throw new Error(ticket.error);

      const form = new FormData();
      for (const [k, v] of Object.entries(ticket.ticket.uploadParams)) {
        form.append(k, v);
      }
      form.append("file", blob, fileName);

      const up = await fetch(ticket.ticket.uploadUrl, {
        method: "POST",
        body: form,
      });

      if (!up.ok) {
        throw new Error(`Upload to Canvas failed (HTTP ${up.status}).`);
      }

      const uploaded = (await up.json().catch(() => null)) as { id?: number } | null;
      if (typeof uploaded?.id !== "number") {
        throw new Error("Canvas did not return the uploaded file id.");
      }

      const result = await createModuleItemAction(
        courseUrl,
        m.id,
        { type: "File", contentId: uploaded.id, title: file.name },
        acronym
      );

      if ("error" in result) throw new Error(result.error);

      setNote({ kind: "success", text: `Added "${file.name}" to the module.` });
      closeVideoPicker();
      reload();
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Failed to add video" });
    } finally {
      setVideoPickerBusy(false);
    }
  };

  const arrowBtn = (label: string, onClick: () => void, disabled: boolean) => (
    <IconButton
      size="small"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {label === "Move up" ? "↑" : "↓"}
    </IconButton>
  );

  return (
    <div className={styles.form}>
      <div className={styles.ccStickyHeader}>
        <div
          className={styles.ccHeaderBody}
          ref={headerBodyRef}
          style={headerHeight != null ? { maxHeight: headerHeight, overflowY: "auto" } : undefined}
        >
        <div className={styles.ccHeaderTop}>
          <h2 className={styles.ccCourseTitle}>{courseName || "Course content"}</h2>
          <div className={styles.ccBarGroup}>
            <span className={styles.ccBarLabel}>Course copy</span>
            <Button
              variant="outlined"
              size="small"
              onClick={onExport}
              disabled={!canCopy}
              title="Copy this course's content into other courses"
            >
              Copy to…
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onImport}
              disabled={!canCopy}
              title="Import another course's content into this one"
            >
              Import from…
            </Button>
            <span className={styles.ccBarDivider} aria-hidden="true" />
            <Button
              variant="outlined"
              size="small"
              onClick={reload}
              disabled={busy || refreshing}
              title="Reload this course's content"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
        <TextField
          type="search"
          size="small"
          fullWidth
          placeholder="Search modules and their items by name…"
          value={moduleSearch}
          onChange={(e) => setModuleSearch(e.target.value)}
        />
      <div className={styles.ccBar}>
        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Select</span>
          <FormControlLabel
            control={<Checkbox checked={allSelected} onChange={toggleAll} disabled={allKeys.length === 0} size="small" />}
            label="Items"
          />
          <FormControlLabel
            control={<Checkbox checked={allModulesSelected} onChange={toggleAllModules} disabled={visibleModules.length === 0} size="small" />}
            label="Modules"
          />
          <TextField
            select
            size="small"
            sx={{ maxWidth: 150 }}
            value=""
            disabled={visibleModules.length === 0}
            onChange={(e) => selectByKind(e.target.value)}
            aria-label="Select all items of a type"
          >
            <MenuItem value="">By type…</MenuItem>
            <MenuItem value="Graded">Graded items</MenuItem>
            <MenuItem value="Assignment">Assignments</MenuItem>
            <MenuItem value="Quiz">Quizzes</MenuItem>
            <MenuItem value="Discussion">Discussions</MenuItem>
            <MenuItem value="Page">Pages</MenuItem>
            <MenuItem value="File">Files</MenuItem>
          </TextField>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Files</span>
          <Button variant="outlined" size="small" onClick={() => setBulkUploadOpen(true)} disabled={busy || modules.length === 0}>
            Bulk upload
          </Button>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Modules</span>
          <Button variant="outlined" size="small" onClick={() => setRenameOpen(true)} disabled={busy || modules.length === 0}>
            Rename
          </Button>
          <Button variant="outlined" size="small" onClick={() => setScheduleOpen(true)} disabled={busy || modules.length === 0}>
            Schedule due dates
          </Button>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Rubrics</span>
          <Button variant="outlined" size="small" onClick={() => setRubricBuilder({ assignments: [] })}>
            New
          </Button>
          <TextField
            select
            size="small"
            sx={{ maxWidth: 180 }}
            value={editRubricId}
            disabled={rubrics.length === 0}
            onChange={(e) => setEditRubricId(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Rubric to edit"
          >
            <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Edit…"}</MenuItem>
            {rubrics.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.title}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            size="small"
            disabled={editRubricId === ""}
            onClick={() => editRubricId !== "" && setRubricBuilder({ assignments: [], editRubricId: Number(editRubricId) })}
          >
            Edit
          </Button>
        </div>
      </div>

      {(selected.size > 0 || selectedModules.size > 0) && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarHead}>
            <span className={styles.bulkCount}>
              {[
                selectedModules.size > 0
                  ? `${selectedModules.size} module${selectedModules.size === 1 ? "" : "s"}`
                  : "",
                selected.size > 0 ? `${selected.size} item${selected.size === 1 ? "" : "s"}` : "",
              ]
                .filter(Boolean)
                .join(", ")}{" "}
              selected
            </span>
            <Button variant="outlined" size="small" onClick={clearSelection}>
              Clear
            </Button>
          </div>

          {selectedModules.size > 0 && (
            <>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Modules</span>
                <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublishModules(true)}>
                  Publish
                </Button>
                <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublishModules(false)}>
                  Unpublish
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  disabled={opBusy}
                  onClick={bulkDeleteModules}
                  title="Delete the selected modules"
                >
                  {confirmDeleteModules ? "Confirm delete" : "Delete"}
                </Button>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Add to each</span>
                <TextField
                  select
                  size="small"
                  value={bulkAddType}
                  onChange={(e) => {
                    const t = e.target.value;
                    setBulkAddType(t);
                  }}
                  aria-label="Type of item to add to each selected module"
                >
                  <MenuItem value="Assignment">Assignment</MenuItem>
                  <MenuItem value="Quiz">Quiz</MenuItem>
                  <MenuItem value="Discussion">Discussion</MenuItem>
                  <MenuItem value="Page">Page</MenuItem>
                  <MenuItem value="File">File</MenuItem>
                  <MenuItem value="SubHeader">Text header</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  sx={{ flex: "1 1 200px", minWidth: 170 }}
                  placeholder={
                    bulkAddType === "File"
                      ? "File name pattern (for an AI-generated file)"
                      : "Name pattern, e.g. {module} - Homework"
                  }
                  value={bulkAddPattern}
                  onChange={(e) => setBulkAddPattern(e.target.value)}
                  aria-label="Name pattern for the new items"
                />
                {bulkAddType === "Assignment" && (
                  <TextField
                    select
                    size="small"
                    sx={{ minWidth: 170 }}
                    value={bulkAddSubType}
                    onChange={(e) => setBulkAddSubType(e.target.value)}
                    aria-label="Submission type for the new assignments"
                  >
                    <MenuItem value="online_text_entry">Text entry</MenuItem>
                    <MenuItem value="online_upload">File upload</MenuItem>
                    <MenuItem value="online_url">Website URL</MenuItem>
                    <MenuItem value="on_paper">On paper</MenuItem>
                    <MenuItem value="none">No submission</MenuItem>
                  </TextField>
                )}
                <Button
                  variant="contained"
                  size="small"
                  disabled={
                    opBusy ||
                    bulkAiBusy ||
                    (bulkAddType === "File"
                      ? (bulkAddFileContent.trim() === "" && bulkAddFileId === "") ||
                        (bulkAddFileContent.trim() !== "" && !bulkAddPattern.trim())
                      : !bulkAddPattern.trim())
                  }
                  onClick={bulkAddToModules}
                  title="Add one new item to each selected module"
                >
                  Add
                </Button>
                <span className={styles.bulkHint}>
                  {"{module}"} = module name, {"{n}"} = week/module number from the title (e.g. &quot;Week 5&quot; -&gt; 5). New items are unpublished.
                </span>
              </div>
              {bulkAddType === "File" && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>File</span>
                  <span className={styles.bulkField}>
                    <span className={styles.bulkFieldLabel}>New file</span>
                    <TextField
                      select
                      size="small"
                      value={bulkAddFileFormat}
                      onChange={(e) => setBulkAddFileFormat(e.target.value === "pptx" ? "pptx" : "docx")}
                      aria-label="Format of the generated file"
                    >
                      <MenuItem value="docx">Word (.docx)</MenuItem>
                      <MenuItem value="pptx">PowerPoint (.pptx)</MenuItem>
                    </TextField>
                  </span>
                  <TextField
                    select
                    size="small"
                    sx={{ flex: "1 1 200px", maxWidth: 300 }}
                    value={bulkAddFileId}
                    disabled={opBusy || bulkAddFileContent.trim() !== ""}
                    onChange={(e) => setBulkAddFileId(e.target.value === "" ? "" : Number(e.target.value))}
                    aria-label="Existing file to add to each module"
                    slotProps={{ select: { onOpen: () => ensureTargets() } }}
                  >
                    <MenuItem value="">{bulkFileOptions().length === 0 ? (targets ? "No files available" : "Loading files…") : "or pick existing file…"}</MenuItem>
                    {bulkFileOptions().map((o) => (
                      <MenuItem key={o.value} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  {bulkAddFileContent.trim() !== "" && (
                    <Button variant="outlined" size="small" onClick={() => setBulkAddFileContent("")}>
                      Discard AI file
                    </Button>
                  )}
                  <span className={styles.bulkHint}>
                    Add an existing course file to every selected module, or generate a new{" "}
                    {bulkAddFileFormat === "pptx" ? "PowerPoint deck" : "Word document"} with AI below
                    (built into a branded {bulkAddFileFormat === "pptx" ? ".pptx" : ".docx"} named with the pattern).
                  </span>
                </div>
              )}
              {["Assignment", "Quiz", "Discussion"].includes(bulkAddType) && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>Details</span>
                  <span className={styles.bulkField}>
                    <span className={styles.bulkFieldLabel}>Due</span>
                    <TextField
                      type="datetime-local"
                      size="small"
                      sx={{ width: 188 }}
                      value={bulkAddDue}
                      onChange={(e) => setBulkAddDue(e.target.value)}
                      aria-label="First due date for the new items"
                      slotProps={{ htmlInput: { } }}
                    />
                  </span>
                  <span className={styles.bulkField}>
                    <span className={styles.bulkFieldLabel}>then every</span>
                    <TextField
                      type="number"
                      size="small"
                      slotProps={{ htmlInput: { min: 0 } }}
                      sx={{ width: 52 }}
                      value={bulkAddStaggerOffset}
                      onChange={(e) => setBulkAddStaggerOffset(Number(e.target.value))}
                      aria-label="Stagger interval between modules"
                    />
                    <TextField
                      select
                      size="small"
                      value={bulkAddStaggerUnit}
                      onChange={(e) => setBulkAddStaggerUnit(e.target.value === "days" ? "days" : "weeks")}
                      aria-label="Stagger interval unit"
                    >
                      <MenuItem value="weeks">weeks</MenuItem>
                      <MenuItem value="days">days</MenuItem>
                    </TextField>
                  </span>
                  {["Assignment", "Quiz"].includes(bulkAddType) && (
                    <span className={styles.bulkField}>
                      <TextField
                        type="number"
                        size="small"
                        sx={{ width: 74 }}
                        placeholder="points"
                        value={bulkAddPoints}
                        onChange={(e) => setBulkAddPoints(e.target.value)}
                        aria-label="Points for the new items"
                      />
                    </span>
                  )}
                  {bulkAddType === "Assignment" && (
                    <span className={styles.bulkField}>
                      <TextField
                        select
                        size="small"
                        sx={{ maxWidth: 170 }}
                        value={bulkAddRubricId}
                        disabled={rubrics.length === 0}
                        onChange={(e) => setBulkAddRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                        aria-label="Rubric for the new items"
                      >
                        <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</MenuItem>
                        {rubrics.map((r) => (
                          <MenuItem key={r.id} value={r.id}>
                            {r.title}
                          </MenuItem>
                        ))}
                      </TextField>
                    </span>
                  )}
                  <span className={styles.bulkHint}>
                    Optional. Due date, points, and rubric are written to every item created above; the
                    stagger pushes each later module&apos;s due date out by the interval (0 = same date).
                  </span>
                </div>
              )}
              {["Assignment", "Quiz", "Discussion", "Page", "File"].includes(bulkAddType) && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>
                    {bulkAddType === "Page"
                      ? "Body"
                      : bulkAddType === "File"
                        ? bulkAddFileFormat === "pptx"
                          ? "Slides"
                          : "File content"
                        : "Description"}
                  </span>
                  <TextField
                    multiline
                    minRows={4}
                    fullWidth
                    value={bulkAddType === "File" ? bulkAddFileContent : bulkAddDescription}
                    onChange={(e) =>
                      bulkAddType === "File"
                        ? setBulkAddFileContent(e.target.value)
                        : setBulkAddDescription(e.target.value)
                    }
                    placeholder={
                      bulkAddType === "Page"
                        ? "Page body (HTML allowed) — written to every new page"
                        : bulkAddType === "File"
                          ? bulkAddFileFormat === "pptx"
                            ? "Slides — # Presentation title, then ## Slide title with - bullets. Generate with AI below or write them here; built into a .pptx. Leave empty to use the picked file"
                            : "Document text (use # Title, ## Section, - bullets) — generate with AI below or write it here; built into a .docx. Leave empty to use the picked file"
                          : "Description (HTML allowed) — written to every new item"
                    }
                    slotProps={{ htmlInput: { spellCheck: true } }}
                    aria-label={bulkAddType === "File" ? "File content for the new files" : "Description for the new items"}
                    size="small"
                  />
                </div>
              )}
              {bulkAddType === "Quiz" && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>Questions</span>
                  <Button variant="outlined" size="small" onClick={() => setBulkQuestionsOpen(true)}>
                    Edit questions{bulkAddQuestions.length > 0 ? ` (${bulkAddQuestions.length})` : ""}
                  </Button>
                  {bulkAddQuestions.length > 0 && (
                    <Button variant="outlined" size="small" onClick={() => setBulkAddQuestions([])}>
                      Clear
                    </Button>
                  )}
                  <span className={styles.bulkHint}>
                    Composed once here and created in every new quiz.
                  </span>
                </div>
              )}
              {bulkAddType !== "SubHeader" && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>AI</span>
                  <TextField
                    size="small"
                    sx={{ flex: "1 1 260px", minWidth: 200 }}
                    placeholder={
                      bulkAddType === "File"
                        ? bulkAddFileFormat === "pptx"
                          ? "Describe the deck to generate, e.g. an intro to photosynthesis"
                          : "Describe the document to generate, e.g. a one-page study guide on photosynthesis"
                        : `Describe the ${bulkAddType.toLowerCase()} content to generate`
                    }
                    value={bulkAiPrompt}
                    onChange={(e) => setBulkAiPrompt(e.target.value)}
                    aria-label="AI prompt for the new content"
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={bulkAiBusy || opBusy || !bulkAiPrompt.trim()}
                    onClick={() => void bulkAiGenerate()}
                  >
                    {bulkAiBusy ? "Generating…" : "Generate with AI"}
                  </Button>
                  <span className={styles.bulkHint}>
                    {bulkAddType === "File"
                      ? bulkAddFileFormat === "pptx"
                        ? "Generates the slides above; review them, then Add to build a branded .pptx for every module."
                        : "Generates the document text above; review it, then Add to build a branded .docx for every module."
                      : "Fills the description/body above with generated HTML; review it, then Add."}
                  </span>
                </div>
              )}
            </>
          )}

          {selected.size > 0 && (
            <>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Items</span>
                <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublish(true)}>
                  Publish
                </Button>
                <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublish(false)}>
                  Unpublish
                </Button>
                {selected.size === 1 &&
                  (() => {
                    const one = selectedItems()[0];
                    if (!one) return null;
                    const it = one.item;
                    if (["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null) {
                      return (
                        <Button variant="outlined" size="small" onClick={() => setEditingItem(it)} title="Edit every attribute of this item">
                          Edit in detail
                        </Button>
                      );
                    }
                    if (it.type === "Page" && it.pageUrl) {
                      return (
                        <Button variant="outlined" size="small" onClick={() => onEditPage(it.pageUrl!)} title="Edit this page">
                          Edit page
                        </Button>
                      );
                    }
                    return null;
                  })()}
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Content</span>
                {descSharedState === "loading" && (
                  <span className={styles.bulkFieldLabel}>Checking descriptions…</span>
                )}
                {descSharedState === "same" && (
                  <span className={styles.bulkFieldLabel}>Loaded the shared description — edits apply to all.</span>
                )}
                {descSharedState === "mixed" && (
                  <span className={styles.bulkFieldLabel}>Selected items have different descriptions; typing replaces them all.</span>
                )}
                <TextField
                  multiline
                  minRows={4}
                  fullWidth
                  value={bulkItemsDescription}
                  onChange={(e) => setBulkItemsDescription(e.target.value)}
                  placeholder="Description (HTML allowed) — replaces the description on selected items / the body of selected pages"
                  slotProps={{ htmlInput: { spellCheck: true } }}
                  aria-label="Description to set on the selected items"
                  size="small"
                />
                <Button variant="contained" size="small" disabled={opBusy} onClick={bulkSetDescription}>
                  Set description
                </Button>
                <span className={styles.bulkField}>
                  <Button variant="outlined" size="small" onClick={() => setBulkItemsQuestionsOpen(true)}>
                    Edit questions{bulkItemsQuestions.length > 0 ? ` (${bulkItemsQuestions.length})` : ""}
                  </Button>
                  <Button variant="outlined" size="small" disabled={opBusy || bulkItemsQuestions.length === 0} onClick={bulkAddQuestionsToQuizzes}>
                    Add to selected quizzes
                  </Button>
                </span>
                <span className={styles.bulkHint}>
                  Set description overwrites the description on selected assignments, quizzes, and discussions (and
                  the body of selected pages). Questions are appended to every selected quiz.
                </span>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Due dates</span>
                <TextField
                  type="datetime-local"
                  size="small"
                  sx={{ width: 188 }}
                  value={bulkDue}
                  onChange={(e) => setBulkDue(e.target.value)}
                  aria-label="Due date"
                  slotProps={{ htmlInput: { } }}
                />
                <Button variant="contained" size="small" disabled={opBusy} onClick={bulkSetDue} title="Set this due date on all selected gradables">
                  Set
                </Button>
                <span className={styles.bulkField}>
                  <TextField
                    type="number"
                    size="small"
                    sx={{ width: 56 }}
                    value={bulkShift}
                    onChange={(e) => setBulkShift(Number(e.target.value))}
                    aria-label="Days to shift"
                  />
                  <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkShiftDue}>
                    Shift days
                  </Button>
                </span>
                <span className={styles.bulkField}>
                  <TextField
                    type="number"
                    size="small"
                    slotProps={{ htmlInput: { min: 0 } }}
                    sx={{ width: 52 }}
                    value={bulkStaggerOffset}
                    onChange={(e) => setBulkStaggerOffset(Number(e.target.value))}
                    aria-label="Stagger interval"
                  />
                  <TextField
                    select
                    size="small"
                    value={bulkStaggerUnit}
                    onChange={(e) => setBulkStaggerUnit(e.target.value === "days" ? "days" : "weeks")}
                    aria-label="Stagger interval unit"
                  >
                    <MenuItem value="weeks">weeks</MenuItem>
                    <MenuItem value="days">days</MenuItem>
                  </TextField>
                  <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkStaggerDue}>
                    Stagger
                  </Button>
                </span>
                <span className={styles.bulkHint}>
                  Stagger gives the earliest selected module the date above, then adds the interval for each later module.
                </span>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Grading</span>
                <span className={styles.bulkField}>
                  <TextField
                    type="number"
                    size="small"
                    sx={{ width: 74 }}
                    placeholder="points"
                    value={bulkPoints}
                    onChange={(e) => setBulkPoints(e.target.value)}
                    aria-label="Points"
                  />
                  <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkSetPoints}>
                    Set points
                  </Button>
                </span>
                <span className={styles.bulkField}>
                  <TextField
                    select
                    size="small"
                    sx={{ maxWidth: 170 }}
                    value={bulkRubricId}
                    disabled={rubrics.length === 0}
                    onChange={(e) => setBulkRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                    aria-label="Rubric"
                  >
                    <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</MenuItem>
                    {rubrics.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.title}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button variant="outlined" size="small" disabled={opBusy || bulkRubricId === ""} onClick={bulkRubric}>
                    Associate
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={opBusy || bulkRubricId === ""}
                    onClick={() => bulkRubricId !== "" && setRubricBuilder({ assignments: [], editRubricId: Number(bulkRubricId) })}
                  >
                    Edit
                  </Button>
                </span>
                <Button variant="outlined" size="small" disabled={opBusy} onClick={openRubricBuilder}>
                  New rubric
                </Button>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Submission type</span>
                <TextField
                  select
                  size="small"
                  sx={{ minWidth: 180 }}
                  value={bulkSubType}
                  onChange={(e) => setBulkSubType(e.target.value)}
                  aria-label="Submission type"
                >
                  <MenuItem value="">Change submission type…</MenuItem>
                  <MenuItem value="online_text_entry">Text entry</MenuItem>
                  <MenuItem value="online_upload">File upload</MenuItem>
                  <MenuItem value="online_url">Website URL</MenuItem>
                  <MenuItem value="on_paper">On paper</MenuItem>
                  <MenuItem value="none">No submission</MenuItem>
                </TextField>
                <Button variant="outlined" size="small" disabled={opBusy || bulkSubType === ""} onClick={bulkUpdateSubmissionType}>
                  Apply
                </Button>
                <span className={styles.bulkHint}>
                  {selectedAssignmentCount() > 0
                    ? `${selectedAssignmentCount()} assignment${selectedAssignmentCount() === 1 ? "" : "s"} selected`
                    : "Select assignment items to change their submission type."}
                </span>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Move</span>
                <span className={styles.bulkField}>
                  <TextField
                    type="number"
                    size="small"
                    slotProps={{ htmlInput: { min: 1 } }}
                    sx={{ width: 56 }}
                    value={bulkModuleShift}
                    onChange={(e) => setBulkModuleShift(Number(e.target.value))}
                    aria-label="Modules to shift by"
                  />
                  <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkShiftModules(-1)}>
                    Shift up
                  </Button>
                  <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkShiftModules(1)}>
                    Shift down
                  </Button>
                </span>
                <span className={styles.bulkField}>
                  <TextField
                    select
                    size="small"
                    sx={{ maxWidth: 190 }}
                    value={bulkTargetModule}
                    disabled={modules.length === 0}
                    onChange={(e) => setBulkTargetModule(e.target.value === "" ? "" : Number(e.target.value))}
                    aria-label="Module to move items into"
                  >
                    <MenuItem value="">{modules.length === 0 ? "No modules" : "Move to module…"}</MenuItem>
                    {modules.map((mod) => (
                      <MenuItem key={mod.id} value={mod.id}>
                        {mod.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button variant="outlined" size="small" disabled={opBusy || bulkTargetModule === ""} onClick={bulkMoveToModule} title="Move selected items into this module">
                    Move
                  </Button>
                </span>
                <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkRemoveFromModule} title="Remove selected items from their module">
                  Remove
                </Button>
                <Button variant="outlined" size="small" color="error" disabled={opBusy} onClick={bulkDeleteContent}>
                  {confirmDeleteContent ? "Confirm delete" : "Delete from Canvas"}
                </Button>
              </div>
            </>
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

      <div className={styles.field}>
        <label htmlFor="content-new-module">Add a module</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TextField
            id="content-new-module"
            size="small"
            sx={{ flex: "1 1 240px" }}
            placeholder="New module name"
            value={newModuleName}
            onChange={(e) => setNewModuleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddModule();
            }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleAddModule}
            disabled={busy || !newModuleName.trim()}
          >
            Add module
          </Button>
        </div>
      </div>

      <div className={styles.field}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setShowNewAssignment((v) => {
                const next = !v;
                if (next && naGroups === null) {
                  void (async () => {
                    const r = await listAssignmentGroupsAction(courseUrl, acronym);
                    if (!("error" in r)) setNaGroups(r.groups);
                  })();
                }
                return next;
              });
            }}
          >
            {showNewAssignment ? "Cancel assignment" : "New assignment"}
          </Button>
        </div>
        {showNewAssignment && (
          <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TextField
                size="small"
                label="Assignment name"
                required
                value={naName}
                onChange={(e) => setNaName(e.target.value)}
                sx={{ flex: "1 1 220px" }}
              />
              <TextField
                size="small"
                type="number"
                label="Points"
                value={naPoints}
                onChange={(e) => setNaPoints(e.target.value)}
                sx={{ width: 100 }}
              />
              <TextField
                select
                size="small"
                label="Grading"
                value={naGrading}
                onChange={(e) => setNaGrading(e.target.value)}
                sx={{ minWidth: 130 }}
              >
                <MenuItem value="points">Points</MenuItem>
                <MenuItem value="percent">Percentage</MenuItem>
                <MenuItem value="pass_fail">Pass/fail</MenuItem>
                <MenuItem value="letter_grade">Letter grade</MenuItem>
                <MenuItem value="not_graded">Not graded</MenuItem>
              </TextField>
              <TextField
                size="small"
                type="datetime-local"
                label="Due"
                value={naDue}
                onChange={(e) => setNaDue(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 210 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TextField
                size="small"
                type="datetime-local"
                label="Available from"
                value={naUnlock}
                onChange={(e) => setNaUnlock(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 200 }}
              />
              <TextField
                size="small"
                type="datetime-local"
                label="Until"
                value={naLock}
                onChange={(e) => setNaLock(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 200 }}
              />
              <TextField
                select
                size="small"
                label="Attempts"
                value={naAttempts}
                onChange={(e) => setNaAttempts(e.target.value)}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="unlimited">Unlimited</MenuItem>
                <MenuItem value="1">1</MenuItem>
                <MenuItem value="2">2</MenuItem>
                <MenuItem value="3">3</MenuItem>
                <MenuItem value="5">5</MenuItem>
              </TextField>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TextField
                select
                size="small"
                label="Submission type"
                value={naType}
                onChange={(e) => setNaType(e.target.value)}
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="online_text_entry">Text entry</MenuItem>
                <MenuItem value="online_upload">File upload</MenuItem>
                <MenuItem value="online_url">Website URL</MenuItem>
                <MenuItem value="on_paper">On paper</MenuItem>
                <MenuItem value="none">No submission</MenuItem>
              </TextField>
              {naType === "online_upload" && (
                <TextField
                  size="small"
                  label="Allowed extensions"
                  placeholder="pdf,docx"
                  value={naExtensions}
                  onChange={(e) => setNaExtensions(e.target.value)}
                  sx={{ width: 170 }}
                />
              )}
              <TextField
                select
                size="small"
                label="Add to module"
                value={naModuleId}
                onChange={(e) => setNaModuleId(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">No module</MenuItem>
                {modules.map((m) => (
                  <MenuItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Assignment group"
                value={naGroupId}
                onChange={(e) => setNaGroupId(e.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">{naGroups === null ? "Loading…" : "Default group"}</MenuItem>
                {(naGroups ?? []).map((g) => (
                  <MenuItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Checkbox size="small" checked={naPeer} onChange={(e) => setNaPeer(e.target.checked)} />}
                label="Peer reviews"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={naOmit} onChange={(e) => setNaOmit(e.target.checked)} />}
                label="Omit from final grade"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={naPublish} onChange={(e) => setNaPublish(e.target.checked)} />}
                label="Publish"
              />
            </div>
            <TextField
              multiline
              minRows={3}
              fullWidth
              label="Description (optional)"
              value={naDescription}
              onChange={(e) => setNaDescription(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                variant="text"
                size="small"
                disabled={naDrafting || !naName.trim()}
                onClick={() => void handleDraftDescription()}
              >
                {naDrafting ? "Drafting…" : "Draft with AI"}
              </Button>
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary, rgba(0,0,0,0.6))" }}>
                Uses the assignment name plus whatever is already in the description as guidance.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="contained"
                size="small"
                disabled={naBusy || !naName.trim()}
                onClick={handleCreateAssignment}
              >
                {naBusy ? "Creating..." : "Create assignment"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {modules.length === 0 && <p className={styles.emptyState}>This course has no modules yet.</p>}

      {moduleSearchLc && modules.length > 0 && !modules.some(moduleMatches) && (
        <p className={styles.emptyState}>No modules or items match &quot;{moduleSearch.trim()}&quot;.</p>
      )}

      {modules.map((m, mi) => {
        if (!moduleMatches(m)) return null;
        const open = expanded.has(m.id);
        const moduleItemsSelected = m.items.length > 0 && m.items.every((it) => selected.has(itemKey(m.id, it.id)));
        return (
          <div
            key={m.id}
            ref={(el) => {
              if (el) moduleNodes.current.set(m.id, el);
              else moduleNodes.current.delete(m.id);
            }}
            className={styles.ccModule}
            onDragOver={(e) => {
              if (moduleDrag !== null) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverModuleRow(m.id);
              }
            }}
            onDragLeave={() => setDragOverModuleRow((cur) => (cur === m.id ? null : cur))}
            onDrop={(e) => {
              if (moduleDrag !== null) {
                e.preventDefault();
                performModuleMove(m.id);
              }
            }}
            style={{
              opacity: moduleDrag === m.id ? 0.55 : 1,
              boxShadow: moduleDrag === m.id ? "0 8px 20px rgba(15, 23, 42, 0.16)" : undefined,
              outline:
                dragOverModuleRow === m.id && moduleDrag !== null && moduleDrag !== m.id
                  ? "2px solid var(--accent)"
                  : undefined,
              outlineOffset: -1,
            }}
          >
            <div
              className={styles.ccHead}
              style={{ cursor: "pointer" }}
              onClick={(e) => rowBlankClick(e, () => toggleModuleSelected(m.id))}
              onDragOver={(e) => {
                if (drag) e.preventDefault();
              }}
              onDrop={(e) => {
                if (drag) {
                  e.preventDefault();
                  performMove(m.id, null);
                }
              }}
            >
              <span
                draggable
                onDragStart={(e) => {
                  setModuleDrag(m.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", `module-${m.id}`);
                }}
                onDragEnd={() => {
                  setModuleDrag(null);
                  setDragOverModuleRow(null);
                }}
                className={styles.ccGrip}
                title="Drag to reorder modules"
                aria-label="Drag to reorder module"
                style={moduleDrag === m.id ? { cursor: "grabbing", color: "var(--accent-ink)" } : undefined}
              >
                ⠿
              </span>
              <Checkbox
                checked={selectedModules.has(m.id)}
                onChange={() => toggleModuleSelected(m.id)}
                aria-label={`Select module ${m.name}`}
                title="Select this module"
                size="small"
              />
              <IconButton
                size="small"
                onClick={() => onToggleExpand(m.id)}
                aria-expanded={open}
                aria-label={open ? "Collapse module" : "Expand module"}
              >
                {open ? "▾" : "▸"}
              </IconButton>
              <Button
                variant="outlined"
                size="small"
                onClick={() => toggleModuleItems(m)}
                disabled={m.items.length === 0}
                title={moduleItemsSelected ? "Deselect every item in this module" : "Select every item in this module"}
              >
                {moduleItemsSelected ? "Deselect items" : "Select items"}
              </Button>
              <TextField
                size="small"
                className={styles.ccName}
                title={m.name}
                value={drafts[`m${m.id}`] ?? m.name}
                onChange={(e) => setDrafts((p) => ({ ...p, [`m${m.id}`]: e.target.value }))}
                onBlur={() => void saveModuleName(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <span className={styles.ccCount}>
                {m.items.length} item{m.items.length === 1 ? "" : "s"}
              </span>
              {arrowBtn("Move up", () => moveModule(mi, -1), busy || mi === 0)}
              {arrowBtn("Move down", () => moveModule(mi, 1), busy || mi === modules.length - 1)}
              <PublishToggle published={m.published} disabled={busy} onClick={() => toggleModule(m)} />
              <IconButton
                size="small"
                component="a"
                href={`${courseBase}/modules#context_module_${m.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open on Canvas"
                aria-label="Open module on Canvas"
              >
                ↗
              </IconButton>
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={() => void removeModule(m)}
                disabled={busy}
              >
                {confirmId === `m${m.id}` ? "Confirm delete" : "Delete"}
              </Button>
            </div>

            {open && (
              <div className={styles.ccItems}>
                {m.items.length === 0 && (
                  <p className={styles.ccHint} style={{ padding: "4px 6px" }}>
                    No items in this module.
                  </p>
                )}
                {m.items.map((it, ii) => !itemVisible(m, it) ? null : (
                  <div
                    key={it.id}
                    ref={(el) => {
                      if (el) itemNodes.current.set(it.id, el);
                      else itemNodes.current.delete(it.id);
                    }}
                    className={styles.ccItem}
                    onClick={(e) => rowBlankClick(e, () => toggleItemSelected(m.id, it.id))}
                    onDragOver={(e) => {
                      if (drag) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverItem(it.id);
                      }
                    }}
                    onDragLeave={() => setDragOverItem((cur) => (cur === it.id ? null : cur))}
                    onDrop={(e) => {
                      if (drag) {
                        e.preventDefault();
                        e.stopPropagation();
                        performMove(m.id, it.id);
                      }
                    }}
                    style={{
                      cursor: "pointer",
                      marginLeft: it.indent * 18,
                      boxShadow:
                        dragOverItem === it.id
                          ? "inset 0 2px 0 var(--accent)"
                          : isDraggingItem(m.id, it.id)
                            ? "0 4px 12px rgba(15, 23, 42, 0.12)"
                            : undefined,
                      background:
                        dragOverItem === it.id
                          ? "var(--accent-soft-strong)"
                          : isDraggingItem(m.id, it.id)
                            ? "var(--accent-soft)"
                            : undefined,
                      opacity: isDraggingItem(m.id, it.id) ? 0.55 : 1,
                    }}
                  >
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDrag({ moduleId: m.id, itemId: it.id });
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(it.id));
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setDragOverItem(null);
                        setDragOverModule(null);
                      }}
                      className={styles.ccGrip}
                      title="Drag to reorder or move between modules"
                      aria-label="Drag to reorder"
                      style={isDraggingItem(m.id, it.id) ? { cursor: "grabbing", color: "var(--accent-ink)" } : undefined}
                    >
                      ⠿
                    </span>
                    <Checkbox
                      checked={selected.has(itemKey(m.id, it.id))}
                      onChange={() => toggleItemSelected(m.id, it.id)}
                      aria-label={`Select ${it.title}`}
                      size="small"
                    />
                    {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null ? (
                      typeEdit === it.id ? (
                        <TextField
                          select
                          size="small"
                          autoFocus
                          className={styles.ccType}
                          value={it.type}
                          onChange={(e) => changeItemType(m, it, e.target.value as GradableKind)}
                          onBlur={() => setTypeEdit(null)}
                          aria-label="Change item type"
                        >
                          <MenuItem value="Assignment">ASSIGNMENT</MenuItem>
                          <MenuItem value="Quiz">QUIZ</MenuItem>
                          <MenuItem value="Discussion">DISCUSSION</MenuItem>
                        </TextField>
                      ) : (
                        <Button
                          variant="outlined"
                          size="small"
                          className={styles.ccType}
                          onClick={() => setTypeEdit(it.id)}
                          disabled={busy}
                          title="Click to change type"
                          sx={{ textTransform: "none", fontFamily: "inherit", cursor: "pointer", border: 0 }}
                        >
                          {it.type}
                        </Button>
                      )
                    ) : (
                      <span className={styles.ccType}>{it.type || "Item"}</span>
                    )}
                    <TextField
                      size="small"
                      className={styles.ccItemName}
                      title={it.title}
                      value={drafts[`i${it.id}`] ?? it.title}
                      onChange={(e) => setDrafts((p) => ({ ...p, [`i${it.id}`]: e.target.value }))}
                      onBlur={() => void saveItemTitle(m, it)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    <span className={styles.ccDueSlot}>
                      {DATED_TYPES.includes(it.type) &&
                        (dueEdit?.id === it.id ? (
                          <TextField
                            type="datetime-local"
                            size="small"
                            autoFocus
                            className={styles.ccDueInput}
                            value={dueEdit.value}
                            onChange={(e) => setDueEdit({ id: it.id, value: e.target.value })}
                            onBlur={() => saveDueEdit(m, it)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setDueEdit(null);
                            }}
                            aria-label="Due date"
                            slotProps={{ htmlInput: { } }}
                          />
                        ) : it.dueAt ? (
                          <Button
                            variant="outlined"
                            size="small"
                            className={`${styles.ccDue} ${new Date(it.dueAt).getTime() < Date.now() ? styles.ccDueOverdue : ""}`}
                            onClick={() => setDueEdit({ id: it.id, value: toLocalInput(it.dueAt) })}
                            disabled={busy || it.contentId == null}
                            title={`Due ${new Date(it.dueAt).toLocaleString()} — click to edit`}
                          >
                            Due {formatDueDate(it.dueAt)}
                          </Button>
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            className={`${styles.ccDue} ${styles.ccDueEmpty}`}
                            onClick={() => setDueEdit({ id: it.id, value: "" })}
                            disabled={busy || it.contentId == null}
                            title="Click to set a due date"
                          >
                            No due date
                          </Button>
                        ))}
                    </span>
                    <span className={styles.ccPointsSlot}>
                      {DATED_TYPES.includes(it.type) &&
                        (pointsEdit?.id === it.id ? (
                          <TextField
                            type="number"
                            size="small"
                            autoFocus
                            className={styles.ccDueInput}
                            value={pointsEdit.value}
                            onChange={(e) => setPointsEdit({ id: it.id, value: e.target.value })}
                            onBlur={() => savePointsEdit(m, it)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setPointsEdit(null);
                            }}
                            aria-label="Points"
                          />
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            className={`${styles.ccDue} ${it.pointsPossible == null ? styles.ccDueEmpty : ""}`}
                            onClick={() =>
                              setPointsEdit({ id: it.id, value: it.pointsPossible != null ? String(it.pointsPossible) : "" })
                            }
                            disabled={busy || it.contentId == null || !POINTS_EDITABLE.includes(it.type)}
                            title={
                              POINTS_EDITABLE.includes(it.type)
                                ? "Click to edit points"
                                : "Points (edit on the assignment)"
                            }
                          >
                            {it.pointsPossible != null ? `${it.pointsPossible} pts` : "No points"}
                          </Button>
                        ))}
                    </span>
                    <div className={styles.ccItemActions}>
                      {arrowBtn("Move up", () => moveItem(m, ii, -1), busy || ii === 0)}
                      {arrowBtn("Move down", () => moveItem(m, ii, 1), busy || ii === m.items.length - 1)}
                      <IconButton
                        size="small"
                        onClick={() => indentItem(m, it, -1)}
                        disabled={busy || it.indent === 0}
                        title="Outdent"
                        aria-label="Outdent"
                      >
                        &lt;
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => indentItem(m, it, 1)}
                        disabled={busy || it.indent >= MAX_INDENT}
                        title="Indent"
                        aria-label="Indent"
                      >
                        &gt;
                      </IconButton>
                      <span className={styles.ccActionsSep} aria-hidden="true" />
                      <ItemA11yBadge item={it} />
                      <PublishToggle published={it.published} disabled={busy} onClick={() => toggleItem(m, it)} />
                      {it.type === "Page" && it.pageUrl && (
                        <Button variant="outlined" size="small" onClick={() => onEditPage(it.pageUrl!)}>
                          Edit page
                        </Button>
                      )}
                      {it.type === "Assignment" && it.contentId != null && (
                        <Button variant="outlined" size="small" onClick={() => setPreviewAssignment(it)}>
                          Preview
                        </Button>
                      )}
                      {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null && (
                        <Button variant="outlined" size="small" onClick={() => setEditingItem(it)}>
                          Edit
                        </Button>
                      )}
                      {it.type === "File" && it.contentId != null && (
                        <Button variant="outlined" size="small" onClick={() => void openFilePreview(it)}>
                          Preview
                        </Button>
                      )}
                      {it.type === "File" && it.contentId != null && /\.(docx|pptx)$/i.test(it.title) && (
                        <Button variant="outlined" size="small" onClick={() => setEditingFile(it)}>
                          Edit
                        </Button>
                      )}
                      {(it.htmlUrl || it.externalUrl) && (
                        <IconButton
                          size="small"
                          component="a"
                          href={(it.htmlUrl || it.externalUrl) as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on Canvas"
                          aria-label="Open on Canvas"
                        >
                          ↗
                        </IconButton>
                      )}
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => void removeItem(m, it)}
                        disabled={busy}
                      >
                        {confirmId === `i${it.id}` ? "Confirm" : "Remove"}
                      </Button>
                    </div>
                  </div>
                ))}

                {drag && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverModule(m.id);
                    }}
                    onDragLeave={() => setDragOverModule((cur) => (cur === m.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      performMove(m.id, null);
                    }}
                    className={`${styles.ccDropEnd} ${dragOverModule === m.id ? styles.ccDropEndActive : ""}`}
                  >
                    Drop here to move to the end of this module
                  </div>
                )}

                <div className={styles.ccAddRow}>
                  <span className={styles.ccCount}>Add item</span>
                  <TextField
                    select
                    size="small"
                    sx={{ maxWidth: 150 }}
                    value={addType[m.id] ?? "NewAssignment"}
                    onChange={(e) => {
                      const t = e.target.value;
                      setAddType((p) => ({ ...p, [m.id]: t }));
                      if (t === "VideoLibrary") {
                        void openVideoPicker(m);
                      }
                      if (t === "RepoLink") {
                        void openRepoPicker(m);
                      }
                    }}
                    disabled={busy}
                    aria-label="Item type"
                  >
                    <MenuItem value="NewAssignment">Assignment</MenuItem>
                    <MenuItem value="File">File (AI generated)</MenuItem>
                    <MenuItem value="ExternalUrl">External URL</MenuItem>
                    <MenuItem value="SubHeader">Text header</MenuItem>
                    <MenuItem value="VideoLibrary">Video from Files library</MenuItem>
                    <MenuItem value="RepoLink">Link to GitHub repo</MenuItem>
                  </TextField>

                  {addType[m.id] === "File" && (
                    <TextField
                      select
                      size="small"
                      sx={{ maxWidth: 150 }}
                      value={addFileFormat[m.id] ?? "docx"}
                      onChange={(e) =>
                        setAddFileFormat((p) => ({ ...p, [m.id]: e.target.value === "pptx" ? "pptx" : "docx" }))
                      }
                      disabled={busy}
                      aria-label="Format of the generated file"
                    >
                      <MenuItem value="docx">Word (.docx)</MenuItem>
                      <MenuItem value="pptx">PowerPoint (.pptx)</MenuItem>
                    </TextField>
                  )}

                  {addType[m.id] === "File" && (
                    <>
                      <TextField
                        size="small"
                        sx={{ flex: "1 1 200px", minWidth: 160 }}
                        placeholder={
                          (addFileFormat[m.id] ?? "docx") === "pptx"
                            ? "Describe a deck to generate with AI"
                            : "Describe a document to generate with AI"
                        }
                        value={addAiPrompt[m.id] ?? ""}
                        onChange={(e) => setAddAiPrompt((p) => ({ ...p, [m.id]: e.target.value }))}
                        aria-label="AI prompt for the new file"
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={busy || !!addAiBusy[m.id] || !(addAiPrompt[m.id] ?? "").trim()}
                        onClick={() => void addAiGenerate(m)}
                      >
                        {addAiBusy[m.id] ? "Generating…" : "Generate with AI"}
                      </Button>
                      {(addFileContent[m.id] ?? "").trim() !== "" && (
                        <>
                          <TextField
                            multiline
                            minRows={4}
                            fullWidth
                            value={addFileContent[m.id] ?? ""}
                            onChange={(e) => setAddFileContent((p) => ({ ...p, [m.id]: e.target.value }))}
                            slotProps={{ htmlInput: { spellCheck: true } }}
                            aria-label="Generated file content"
                            size="small"
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => setAddFileContent((p) => ({ ...p, [m.id]: "" }))}
                          >
                            Discard
                          </Button>
                        </>
                      )}
                    </>
                  )}

                  {addType[m.id] === "ExternalUrl" && (
                    <>
                      <TextField
                        type="url"
                        size="small"
                        sx={{ flex: "1 1 200px", maxWidth: 280 }}
                        placeholder="https://example.com"
                        value={addUrl[m.id] ?? ""}
                        onChange={(e) => setAddUrl((p) => ({ ...p, [m.id]: e.target.value }))}
                      />
                      <TextField
                        size="small"
                        sx={{ flex: "1 1 140px", maxWidth: 200 }}
                        placeholder="Link text (optional)"
                        value={addTitle[m.id] ?? ""}
                        onChange={(e) => setAddTitle((p) => ({ ...p, [m.id]: e.target.value }))}
                      />
                    </>
                  )}

                  {addType[m.id] === "SubHeader" && (
                    <TextField
                      size="small"
                      sx={{ flex: "1 1 200px", maxWidth: 280 }}
                      placeholder="Header text"
                      value={addTitle[m.id] ?? ""}
                      onChange={(e) => setAddTitle((p) => ({ ...p, [m.id]: e.target.value }))}
                    />
                  )}

                  {addType[m.id] === "VideoLibrary" && videoPickerModuleId === m.id && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 100%", maxWidth: "100%" }}>
                      {videoPickerLoading && <span style={{ fontSize: "0.875rem", color: "var(--muted-text, #666)" }}>Loading your library...</span>}
                      {videoPickerError && <span style={{ fontSize: "0.875rem", color: "var(--error, #b91c1c)" }}>{videoPickerError}</span>}
                      {!videoPickerLoading && videoPickerFiles && videoPickerFiles.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {videoPickerFiles.map((file) => (
                            <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid var(--border-color, #ddd)", borderRadius: 4 }}>
                              <div style={{ flex: "1 1 100%" }}>
                                <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{file.name}</div>
                                <div style={{ fontSize: "0.8rem", color: "var(--muted-text, #666)" }}>
                                  {file.kind === "recording" ? "Recording" : "Captioned"} - {(file.sizeBytes / 1048576).toFixed(1)} MB - {new Date(file.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => void addVideoFromLibrary(m, file)}
                                disabled={videoPickerBusy || busy}
                              >
                                {videoPickerBusy ? "Adding..." : "Add"}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button variant="text" size="small" onClick={() => closeVideoPicker()} disabled={videoPickerBusy || busy}>
                        Cancel
                      </Button>
                    </div>
                  )}

                  {addType[m.id] === "RepoLink" && repoPickerModuleId === m.id && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 100%", maxWidth: "100%" }}>
                      {repoPickerLoading && <span style={{ fontSize: "0.875rem", color: "var(--muted-text, #666)" }}>Loading your repositories...</span>}
                      {repoPickerError && <span style={{ fontSize: "0.875rem", color: "var(--error, #b91c1c)" }}>{repoPickerError}</span>}
                      {!repoPickerLoading && ownedRepos && (
                        <>
                          <Autocomplete
                            freeSolo
                            options={ownedRepos}
                            inputValue={addRepoValue[m.id] ?? ""}
                            onInputChange={(_, v) => setAddRepoValue((p) => ({ ...p, [m.id]: v }))}
                            onChange={(_, v) => {
                              if (v) {
                                const repoName = v.split("/")[1] || v;
                                setAddRepoValue((p) => ({ ...p, [m.id]: v }));
                                setAddRepoTitle((p) => ({ ...p, [m.id]: repoName }));
                              }
                            }}
                            renderInput={(params) => <TextField {...params} label="Repository" placeholder="owner/name" size="small" />}
                            disabled={repoPickerBusy || busy}
                            sx={{ flex: "1 1 100%" }}
                          />
                          <TextField
                            size="small"
                            label="Title"
                            placeholder={addRepoValue[m.id] || "Link text"}
                            value={addRepoTitle[m.id] ?? ""}
                            onChange={(e) => setAddRepoTitle((p) => ({ ...p, [m.id]: e.target.value }))}
                            disabled={repoPickerBusy || busy}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => void addRepoLink(m)}
                              disabled={repoPickerBusy || busy || !(addRepoValue[m.id] ?? "").match(/^[^/\s]+\/[^/\s]+$/)}
                            >
                              {repoPickerBusy ? "Adding..." : "Add"}
                            </Button>
                            <Button variant="text" size="small" onClick={() => closeRepoPicker()} disabled={repoPickerBusy || busy}>
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {addType[m.id] === "NewAssignment" && (
                    <>
                      <TextField size="small" placeholder="Assignment name" value={asgOf(m.id).name} onChange={(e) => patchAsg(m.id, { name: e.target.value })} disabled={busy} sx={{ flex: "1 1 180px" }} />
                      <TextField size="small" type="number" label="Points" value={asgOf(m.id).points} onChange={(e) => patchAsg(m.id, { points: e.target.value })} disabled={busy} sx={{ width: 90 }} slotProps={{ inputLabel: { shrink: true } }} />
                      <TextField size="small" type="datetime-local" label="Due" value={asgOf(m.id).due} onChange={(e) => patchAsg(m.id, { due: e.target.value })} disabled={busy} sx={{ width: 200 }} slotProps={{ inputLabel: { shrink: true } }} />
                      <TextField select size="small" label="Type" value={asgOf(m.id).stype} onChange={(e) => patchAsg(m.id, { stype: e.target.value })} disabled={busy} sx={{ minWidth: 140 }}>
                        <MenuItem value="online_text_entry">Text entry</MenuItem>
                        <MenuItem value="online_upload">File upload</MenuItem>
                        <MenuItem value="online_url">Website URL</MenuItem>
                        <MenuItem value="on_paper">On paper</MenuItem>
                        <MenuItem value="none">No submission</MenuItem>
                      </TextField>
                      <FormControlLabel control={<Checkbox size="small" checked={asgOf(m.id).publish} onChange={(e) => patchAsg(m.id, { publish: e.target.checked })} disabled={busy} />} label="Publish" />
                    </>
                  )}

                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void addItem(m)}
                    disabled={busy || !canAdd(m)}
                  >
                    Add
                  </Button>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void handleModuleFiles(m, e.dataTransfer.files);
                  }}
                  className={styles.ccDrop}
                >
                  <span className={styles.ccHint}>Drop files to add to this module, or</span>
                  <label className={styles.ccBtn} style={{ cursor: "pointer" }}>
                    choose files
                    <input
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files) void handleModuleFiles(m, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {(uploads[m.id] ?? []).length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                    {(uploads[m.id] ?? []).map((row, idx) => (
                      <span
                        key={`${m.id}-up-${idx}`}
                        className={styles.ccHint}
                        style={{ color: row.status === "error" ? "var(--error, #b91c1c)" : undefined }}
                      >
                        {row.name}:{" "}
                        {row.status === "uploading"
                          ? "uploading…"
                          : row.status === "done"
                            ? "added"
                            : `failed (${row.error})`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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

      {bulkQuestionsOpen && (
        <BulkQuestionsModal
          questions={bulkAddQuestions}
          setQuestions={setBulkAddQuestions}
          onClose={() => setBulkQuestionsOpen(false)}
        />
      )}

      {bulkItemsQuestionsOpen && (
        <BulkQuestionsModal
          questions={bulkItemsQuestions}
          setQuestions={setBulkItemsQuestions}
          onClose={() => setBulkItemsQuestionsOpen(false)}
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

      {rubricBuilder && (
        <RubricBuilderModal
          courseUrl={courseUrl}
          acronym={acronym}
          assignments={rubricBuilder.assignments}
          rubricId={rubricBuilder.editRubricId}
          onClose={() => setRubricBuilder(null)}
          onCreated={(title, associated) => {
            const editing = rubricBuilder.editRubricId != null;
            setRubricBuilder(null);
            void refreshRubrics();
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

