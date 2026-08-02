"use client";

// Page edit session for the Knowledge tab (src/app/components/KnowledgeTab.tsx)
// - split out during the 1000-line-cap refactor. Owns the draft title/body/
// tags a page is being edited into, the unsaved-edits guard built on top of
// it (the "dirty" check, the beforeunload warning, and reporting dirty state
// up to page.tsx for its own Back/Forward guard), and the save/cancel/
// attachment-embed actions that operate on the draft. Only loosely coupled
// to the page list/tree selection, the attachments list, and the
// create/rename/delete/reorder controls that sit alongside it in that file -
// callers only need to pass in which page is selected and how to refresh
// after a save (see saveEdit below), not the whole page-tree state.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { updateInstitutionPageAction } from "../../actions";
import type { InstitutionPage } from "@/lib/knowledge-base";
import type { InstitutionPageAttachment } from "@/lib/institution-page-attachments";
import { buildAttachmentEmbedReference, insertEmbedReferenceIntoBody } from "./attachment-embed";
import { KB_DISCARD_MESSAGE, isDraftDirty, parseTagsInput } from "./knowledge-helpers";

export interface EditSnapshot {
  title: string;
  body: string;
  tags: string;
}

export interface UseKbEditSessionArgs {
  active: string;
  /** Reports unsaved-edit state up to page.tsx (AC5) - see the effects below. */
  onDirtyChange: (dirty: boolean) => void;
  /** pendingAction is a cross-cutting "mutation in flight" flag shared with
   *  the create/rename/delete/reorder controls in useKbTreeActions, so it is
   *  owned by KnowledgeTab.tsx rather than by either hook. */
  setPendingAction: (action: string | null) => void;
}

export interface UseKbEditSessionReturn {
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;
  editSnapshot: EditSnapshot | null;
  setEditSnapshot: (value: EditSnapshot | null) => void;
  draftTitle: string;
  setDraftTitle: (value: string) => void;
  draftBody: string;
  setDraftBody: (value: string) => void;
  draftTags: string;
  setDraftTags: (value: string) => void;
  saveError: string | null;
  dirty: boolean;
  bodyTextareaRef: RefObject<HTMLTextAreaElement | null>;
  confirmDiscard: () => boolean;
  /** Resets isEditing/editSnapshot/saveError together - the reset used both
   *  by useKbPageTree's selection-reconciliation effect and by
   *  KnowledgeTab.tsx's selectPage when a genuinely new page is selected.
   *  Stable identity (empty deps) so passing it into another hook's effect
   *  dependency array never changes that effect's re-run timing. */
  closeEditSession: () => void;
  beginEdit: (page: InstitutionPage) => void;
  /** Takes the current selection and a refresh callback as call-time
   *  arguments (rather than hook-construction args) so this hook never
   *  needs to depend on useKbPageTree - see KnowledgeTab.tsx's call site. */
  saveEdit: (selectedId: string | null, refresh: (selectId?: string | null) => Promise<void>) => Promise<void>;
  cancelEdit: () => void;
  insertAttachmentEmbed: (attachment: InstitutionPageAttachment) => void;
}

export function useKbEditSession({
  active,
  onDirtyChange,
  setPendingAction,
}: UseKbEditSessionArgs): UseKbEditSessionReturn {
  // ── Edit session ──────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<EditSnapshot | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Ref to the body textarea (rendered in KnowledgeTab.tsx), so the
  // AttachmentsPanel "Insert" button can splice an embed reference in at the
  // current cursor position - see insertAttachmentEmbed.
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset the edit session the instant the active institution changes
  // (adjust state during render, not an effect - see AGENTS.md's
  // set-state-in-effect idiom). Deliberately does NOT reset draftTitle/
  // draftBody/draftTags - isEditing becomes false here, so those drafts
  // simply go unused until the next beginEdit() overwrites them, exactly as
  // in the original monolith (a stale draft is harmless since nothing
  // renders it while isEditing is false).
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setIsEditing(false);
    setEditSnapshot(null);
    setSaveError(null);
  }

  // Warn on an actual tab close/reload while a page edit is unsaved.
  const dirty = isDraftDirty(isEditing, editSnapshot, draftTitle, draftBody, draftTags);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Report dirty state up to page.tsx (AC5) - a popstate restore bypasses
  // every in-tab confirmDiscard() call below, so page.tsx needs its own
  // up-to-date read of this to decide whether to prompt before applying one.
  // Forced to false on unmount so the flag never outlives this hook's owner
  // (e.g. switching away from the Knowledge tab entirely, which unmounts it).
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  const confirmDiscard = (): boolean => {
    if (!dirty) return true;
    return window.confirm(KB_DISCARD_MESSAGE);
  };

  const closeEditSession = useCallback(() => {
    setIsEditing(false);
    setEditSnapshot(null);
    setSaveError(null);
  }, []);

  const beginEdit = (page: InstitutionPage) => {
    setDraftTitle(page.title);
    setDraftBody(page.body);
    setDraftTags(page.tags.join(", "));
    setEditSnapshot({ title: page.title, body: page.body, tags: page.tags.join(", ") });
    setIsEditing(true);
    setSaveError(null);
  };

  // ── Edit session save/cancel ────────────────────────────────────────────
  const saveEdit = async (
    selectedId: string | null,
    refresh: (selectId?: string | null) => Promise<void>
  ) => {
    if (!selectedId) return;
    setPendingAction("save");
    setSaveError(null);
    const tags = parseTagsInput(draftTags);
    const result = await updateInstitutionPageAction(selectedId, {
      title: draftTitle.trim() || "Untitled page",
      body: draftBody,
      tags,
    });
    setPendingAction(null);
    if ("error" in result) {
      setSaveError(result.error);
      return;
    }
    setIsEditing(false);
    setEditSnapshot(null);
    await refresh();
  };

  const cancelEdit = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this page?")) return;
    setIsEditing(false);
    setEditSnapshot(null);
    setSaveError(null);
  };

  // Embed an already-uploaded attachment into the draft body at the current
  // cursor position (AC2 - never a second upload, just a stable
  // attachment://<id> reference; see attachment-embed.ts). Falls back to
  // appending at the end when the textarea ref is not available yet (e.g.
  // "Insert" clicked before the textarea has mounted a selection).
  const insertAttachmentEmbed = (attachment: InstitutionPageAttachment) => {
    const reference = buildAttachmentEmbedReference(attachment.fileName, attachment.id);
    const textarea = bodyTextareaRef.current;
    const start = textarea?.selectionStart ?? draftBody.length;
    const end = textarea?.selectionEnd ?? draftBody.length;
    const { text, cursor } = insertEmbedReferenceIntoBody(draftBody, start, end, reference);
    setDraftBody(text);
    // The textarea still holds the OLD value at this point in the event
    // handler - restoring focus/selection has to wait for React to commit
    // the new value to the DOM first.
    requestAnimationFrame(() => {
      const el = bodyTextareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  };

  return {
    isEditing,
    setIsEditing,
    editSnapshot,
    setEditSnapshot,
    draftTitle,
    setDraftTitle,
    draftBody,
    setDraftBody,
    draftTags,
    setDraftTags,
    saveError,
    dirty,
    bodyTextareaRef,
    confirmDiscard,
    closeEditSession,
    beginEdit,
    saveEdit,
    cancelEdit,
    insertAttachmentEmbed,
  };
}
