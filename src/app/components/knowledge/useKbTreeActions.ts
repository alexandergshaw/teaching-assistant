"use client";

// Tree-management controls for the Knowledge tab (src/app/components/
// KnowledgeTab.tsx): create (top-level and child pages), rename, delete
// (with the descendant-count warning), and reorder/re-parent - split out
// during the 1000-line-cap refactor. Shares only active/selectedId/pages/
// tree/expanded and a refresh() callback with useKbPageTree, and only
// confirmDiscard()/beginEdit() (plus two edit-session setters, for the
// delete path) with useKbEditSession - it owns no state either of those
// hooks needs back.

import { useState } from "react";
import {
  createInstitutionPageAction,
  updateInstitutionPageAction,
  moveInstitutionPageAction,
  deleteInstitutionPageAction,
} from "../../actions";
import type { InstitutionPage, InstitutionPageNode } from "@/lib/knowledge-base";
import { findNode, countDescendants, computeReorder, writeExpandedIds, type PositionedItem } from "./knowledge-helpers";
import type { EditSnapshot } from "./useKbEditSession";

export interface UseKbTreeActionsArgs {
  active: string;
  selectedId: string | null;
  pages: InstitutionPage[] | null;
  tree: InstitutionPageNode[];
  selectedPage: InstitutionPage | null;
  expanded: Set<string>;
  setExpanded: (next: Set<string>) => void;
  refresh: (selectId?: string | null) => Promise<void>;
  confirmDiscard: () => boolean;
  beginEdit: (page: InstitutionPage) => void;
  /** Delete's own reset touches only these two - see confirmDeleteRequest
   *  below, which deliberately does not also clear saveError (matching the
   *  original monolith exactly; delete is only reachable while isEditing is
   *  already false, via KnowledgeTab.tsx's controlsDisabled). */
  setIsEditing: (value: boolean) => void;
  setEditSnapshot: (value: EditSnapshot | null) => void;
  /** pendingAction/actionError are cross-cutting flags shared with
   *  useKbEditSession's saveEdit and useKbPageTree's refresh, so they are
   *  owned by KnowledgeTab.tsx rather than by any one hook. */
  setPendingAction: (action: string | null) => void;
  setActionError: (message: string | null) => void;
}

export interface UseKbTreeActionsReturn {
  renamingId: string | null;
  renameDraft: string;
  setRenameDraft: (value: string) => void;
  startRename: () => void;
  cancelRename: () => void;
  commitRename: () => Promise<void>;
  deleteTarget: string | null;
  setDeleteTarget: (id: string | null) => void;
  deleteTargetPage: InstitutionPage | null;
  deleteDescendantCount: number;
  confirmDeleteRequest: () => Promise<void>;
  createTopLevel: () => Promise<void>;
  createChild: () => Promise<void>;
  reorder: (direction: "up" | "down") => Promise<void>;
  reparent: (parentId: string | null) => Promise<void>;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function useKbTreeActions({
  active,
  selectedId,
  pages,
  tree,
  selectedPage,
  expanded,
  setExpanded,
  refresh,
  confirmDiscard,
  beginEdit,
  setIsEditing,
  setEditSnapshot,
  setPendingAction,
  setActionError,
}: UseKbTreeActionsArgs): UseKbTreeActionsReturn {
  // ── Tree-management controls (rename, delete, reorder, reparent) ───────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Reset the instant the active institution changes (adjust state during
  // render, not an effect - see AGENTS.md's set-state-in-effect idiom and
  // useKbPageTree/useKbEditSession's identical pattern for the state they
  // each own).
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setDeleteTarget(null);
    setRenamingId(null);
  }

  // ── Create ───────────────────────────────────────────────────────────
  const createTopLevel = async () => {
    if (!active || !confirmDiscard()) return;
    setPendingAction("create-top");
    const result = await createInstitutionPageAction({ institution: active, title: "Untitled page" });
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    await refresh(result.page.id);
    beginEdit(result.page);
  };

  const createChild = async () => {
    if (!active || !selectedId || !confirmDiscard()) return;
    const parentId = selectedId;
    setPendingAction("create-child");
    const result = await createInstitutionPageAction({ institution: active, parentId, title: "Untitled page" });
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    const next = new Set(expanded);
    next.add(parentId);
    setExpanded(next);
    writeExpandedIds(active, next);
    await refresh(result.page.id);
    beginEdit(result.page);
  };

  // ── Rename (title-only, saved immediately - independent of the full
  //     body/tags edit session, disabled while that session is open) ─────
  const startRename = () => {
    if (!selectedPage) return;
    setRenamingId(selectedPage.id);
    setRenameDraft(selectedPage.title);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const id = renamingId;
    const title = renameDraft.trim() || "Untitled page";
    const target = pages?.find((p) => p.id === id);
    setRenamingId(null);
    if (!target || target.title === title) return;
    setPendingAction("rename");
    const result = await updateInstitutionPageAction(id, { title });
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    await refresh();
  };

  // ── Delete (AC5: the confirmation states the real descendant count) ────
  const deleteTargetPage = deleteTarget ? pages?.find((p) => p.id === deleteTarget) ?? null : null;
  const deleteDescendantCount = deleteTarget ? countDescendants(tree, deleteTarget) : 0;

  const confirmDeleteRequest = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    setPendingAction("delete");
    const result = await deleteInstitutionPageAction(id);
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    setIsEditing(false);
    setEditSnapshot(null);
    await refresh(null);
  };

  // ── Reorder (move up/down among siblings) and re-parent ────────────────
  const selectedNode: InstitutionPageNode | null = selectedId ? findNode(tree, selectedId) : null;
  const siblingNodes: InstitutionPageNode[] = selectedNode
    ? selectedNode.parentId
      ? findNode(tree, selectedNode.parentId)?.children ?? []
      : tree
    : [];
  const siblingPositions: PositionedItem[] = siblingNodes.map((n) => ({ id: n.id, position: n.position }));

  const reorder = async (direction: "up" | "down") => {
    if (!selectedId) return;
    const pair = computeReorder(siblingPositions, selectedId, direction);
    if (!pair) return;
    setPendingAction(direction === "up" ? "move-up" : "move-down");
    const [a, b] = pair;
    const resA = await moveInstitutionPageAction(a.id, { position: a.position });
    if ("error" in resA) {
      setPendingAction(null);
      setActionError(resA.error);
      return;
    }
    const resB = await moveInstitutionPageAction(b.id, { position: b.position });
    setPendingAction(null);
    if ("error" in resB) {
      setActionError(resB.error);
      return;
    }
    await refresh();
  };

  const reparent = async (parentId: string | null) => {
    if (!active || !selectedId) return;
    setPendingAction("reparent");
    const result = await moveInstitutionPageAction(selectedId, { parentId });
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    if (parentId) {
      const next = new Set(expanded);
      next.add(parentId);
      setExpanded(next);
      writeExpandedIds(active, next);
    }
    await refresh();
  };

  const canMoveUp = selectedId ? computeReorder(siblingPositions, selectedId, "up") !== null : false;
  const canMoveDown = selectedId ? computeReorder(siblingPositions, selectedId, "down") !== null : false;

  return {
    renamingId,
    renameDraft,
    setRenameDraft,
    startRename,
    cancelRename,
    commitRename,
    deleteTarget,
    setDeleteTarget,
    deleteTargetPage,
    deleteDescendantCount,
    confirmDeleteRequest,
    createTopLevel,
    createChild,
    reorder,
    reparent,
    canMoveUp,
    canMoveDown,
  };
}
