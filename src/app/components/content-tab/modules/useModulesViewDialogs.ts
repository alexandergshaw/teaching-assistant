import { useRef, useState } from "react";
import { previewFileAction } from "../../../actions";
import type { CanvasModuleItem } from "@/lib/canvas-modules";
import type { PreviewFile } from "../../FilePreviewModal";
import { base64ToBlobUrl } from "../utils";
import type { GenerationKindId } from "./useLmsGeneration";

/**
 * Every dialog `ModulesView` opens (open/close state), the focus-restoration
 * refs each one's opener writes, and the two handlers - `openFilePreview` /
 * `openGeneratedPreview` - whose captures have to happen synchronously,
 * before an async step, rather than inside the dialog itself. Extracted
 * structurally out of ModulesView.tsx (which was over this repo's 1000-line
 * ceiling) - no behaviour changed, only moved.
 *
 * Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
 * wave R2): this file owns every dialog's state, so it owns every opener's
 * captured ref too (decision 4 - one ref per DIALOG; a multi-opener dialog's
 * openers all write the same ref). Two container fallbacks (decision 2/AC5)
 * back every one of them: headerFallbackRef (`.ccHeaderBody` in ModulesView,
 * merged with its existing headerBodyRef) outlives every header-bar button
 * and bulk-bar opener, which unmount when the selection clears;
 * modulesListFallbackRef (the wrapper around the module list in ModulesView)
 * outlives any single row, which unmounts on reorder, delete, a search-
 * filter, or a reload. Every trigger ref is typed RefObject<HTMLElement |
 * null> and populated by direct `.current =` assignment (never a JSX
 * `ref=`), so the invariance useModalDismiss.ts documents on this same type
 * never needs a cast here.
 */
export function useModulesViewDialogs(courseUrl: string, acronym: string | undefined, generate: (kindId: GenerationKindId) => void) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CanvasModuleItem | null>(null);
  const [filePreview, setFilePreview] = useState<{ file: PreviewFile; blobUrl: string | null } | null>(null);
  const [editingFile, setEditingFile] = useState<CanvasModuleItem | null>(null);
  // The assignment being previewed in a read-only modal.
  const [previewAssignment, setPreviewAssignment] = useState<CanvasModuleItem | null>(null);

  const headerFallbackRef = useRef<HTMLElement | null>(null);
  const modulesListFallbackRef = useRef<HTMLElement | null>(null);

  const schedulerTriggerRef = useRef<HTMLElement | null>(null);
  const onSchedulerTrigger = (trigger: HTMLElement) => { schedulerTriggerRef.current = trigger; };
  const bulkUploadTriggerRef = useRef<HTMLElement | null>(null);
  const onBulkUploadTrigger = (trigger: HTMLElement) => { bulkUploadTriggerRef.current = trigger; };
  const bulkCreateTriggerRef = useRef<HTMLElement | null>(null);
  const onBulkCreateTrigger = (trigger: HTMLElement) => { bulkCreateTriggerRef.current = trigger; };
  const renameTriggerRef = useRef<HTMLElement | null>(null);
  const onRenameTrigger = (trigger: HTMLElement) => { renameTriggerRef.current = trigger; };
  // RubricBuilderModal's four openers (ModulesHeaderBar's "New"/"Edit",
  // BulkItemsSection's "Edit"/"New rubric") all write this one ref.
  const rubricBuilderTriggerRef = useRef<HTMLElement | null>(null);
  const onRubricBuilderTrigger = (trigger: HTMLElement) => { rubricBuilderTriggerRef.current = trigger; };
  // BulkQuestionsModal renders TWICE below, from two INDEPENDENT state
  // variables (bulkModuleActions.bulkQuestionsOpen,
  // bulkItemActions.bulkItemsQuestionsOpen) - two single-opener dialog
  // instances of the same component, each with its own ref.
  const moduleQuestionsTriggerRef = useRef<HTMLElement | null>(null);
  const onModuleQuestionsTrigger = (trigger: HTMLElement) => { moduleQuestionsTriggerRef.current = trigger; };
  const itemQuestionsTriggerRef = useRef<HTMLElement | null>(null);
  const onItemQuestionsTrigger = (trigger: HTMLElement) => { itemQuestionsTriggerRef.current = trigger; };
  // GradableEditorModal's two openers (ModuleItemRow's row "Edit",
  // BulkItemsSection's "Edit in detail") both write this one ref.
  const gradableEditorTriggerRef = useRef<HTMLElement | null>(null);
  const onGradableEditorTrigger = (trigger: HTMLElement) => { gradableEditorTriggerRef.current = trigger; };
  const officeEditorTriggerRef = useRef<HTMLElement | null>(null);
  const onOfficeEditorTrigger = (trigger: HTMLElement) => { officeEditorTriggerRef.current = trigger; };
  const previewAssignmentTriggerRef = useRef<HTMLElement | null>(null);
  const onPreviewAssignmentTrigger = (trigger: HTMLElement) => { previewAssignmentTriggerRef.current = trigger; };

  // GeneratedPreviewModal's `preview` state is set asynchronously inside
  // useLmsGeneration's own `generate` (after an await), so capture has to
  // happen HERE, before `generate` is ever called (decision 3) - wrapping it
  // rather than adding a capture-only sibling prop, since there is no
  // existing `onGenerate` call to sit alongside. Every kind button in
  // GenerateFromSelectionSection funnels through this wrapper, so they
  // share one ref (decision 4).
  const generatedPreviewTriggerRef = useRef<HTMLElement | null>(null);
  const openGeneratedPreview = (kindId: GenerationKindId, trigger: HTMLElement) => {
    generatedPreviewTriggerRef.current = trigger;
    generate(kindId);
  };

  const filePreviewTriggerRef = useRef<HTMLElement | null>(null);

  const openFilePreview = async (it: CanvasModuleItem, trigger: HTMLElement) => {
    if (it.contentId == null) return;
    // Captured synchronously, before the await below (decision 3) - this
    // function itself performs the await, so the capture has to happen
    // right here rather than in ModuleItemRow's onClick.
    filePreviewTriggerRef.current = trigger;
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

  return {
    scheduleOpen,
    setScheduleOpen,
    bulkUploadOpen,
    setBulkUploadOpen,
    bulkCreateOpen,
    setBulkCreateOpen,
    renameOpen,
    setRenameOpen,
    editingItem,
    setEditingItem,
    filePreview,
    editingFile,
    setEditingFile,
    previewAssignment,
    setPreviewAssignment,
    headerFallbackRef,
    modulesListFallbackRef,
    schedulerTriggerRef,
    onSchedulerTrigger,
    bulkUploadTriggerRef,
    onBulkUploadTrigger,
    bulkCreateTriggerRef,
    onBulkCreateTrigger,
    renameTriggerRef,
    onRenameTrigger,
    rubricBuilderTriggerRef,
    onRubricBuilderTrigger,
    moduleQuestionsTriggerRef,
    onModuleQuestionsTrigger,
    itemQuestionsTriggerRef,
    onItemQuestionsTrigger,
    gradableEditorTriggerRef,
    onGradableEditorTrigger,
    officeEditorTriggerRef,
    onOfficeEditorTrigger,
    previewAssignmentTriggerRef,
    onPreviewAssignmentTrigger,
    generatedPreviewTriggerRef,
    openGeneratedPreview,
    filePreviewTriggerRef,
    openFilePreview,
    closeFilePreview,
  };
}

export type UseModulesViewDialogsReturn = ReturnType<typeof useModulesViewDialogs>;
