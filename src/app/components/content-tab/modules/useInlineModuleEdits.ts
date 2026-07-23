"use client";

import type React from "react";
import { useState } from "react";
import type { CanvasModule, CanvasModuleItem, BulkKind, GradableKind } from "@/lib/canvas-modules";
import {
  bulkDeleteAction,
  createGradableAction,
  createModuleItemAction,
  deleteModuleAction,
  deleteModuleItemAction,
  getGradableAction,
  setModuleDueDatesAction,
  updateGradableAction,
  updateModuleAction,
  updateModuleItemAction,
} from "../../../actions";
import { MAX_INDENT } from "../constants";
import { toLocalInput } from "../utils";

export interface UseInlineModuleEditsReturn {
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  confirmId: string | null;
  setConfirmId: React.Dispatch<React.SetStateAction<string | null>>;
  dueEdit: { id: number; value: string } | null;
  setDueEdit: React.Dispatch<React.SetStateAction<{ id: number; value: string } | null>>;
  pointsEdit: { id: number; value: string } | null;
  setPointsEdit: React.Dispatch<React.SetStateAction<{ id: number; value: string } | null>>;
  typeEdit: number | null;
  setTypeEdit: React.Dispatch<React.SetStateAction<number | null>>;
  run: (fn: () => Promise<{ error: string } | unknown>, fallbackMsg: string) => Promise<void>;
  saveModuleName: (m: CanvasModule) => Promise<void>;
  toggleModule: (m: CanvasModule) => void;
  moveModule: (index: number, dir: -1 | 1) => void;
  removeModule: (m: CanvasModule) => Promise<void>;
  saveItemTitle: (m: CanvasModule, it: CanvasModuleItem) => Promise<void>;
  saveDueEdit: (m: CanvasModule, it: CanvasModuleItem) => void;
  savePointsEdit: (m: CanvasModule, it: CanvasModuleItem) => void;
  changeItemType: (m: CanvasModule, it: CanvasModuleItem, target: GradableKind) => void;
  toggleItem: (m: CanvasModule, it: CanvasModuleItem) => void;
  moveItem: (m: CanvasModule, index: number, dir: -1 | 1) => void;
  indentItem: (m: CanvasModule, it: CanvasModuleItem, delta: -1 | 1) => void;
  removeItem: (m: CanvasModule, it: CanvasModuleItem) => Promise<void>;
}

// Single-item / single-module CRUD: inline title, due-date, points, and type
// edits, plus publish/reorder/indent/delete for one module or one item at a
// time. `run` is the shared write-and-reconcile helper other hooks reuse for
// their own one-off writes (module creation, drag-drop persistence, etc).
export function useInlineModuleEdits(
  courseUrl: string,
  acronym: string | undefined,
  modules: CanvasModule[],
  setModules: React.Dispatch<React.SetStateAction<CanvasModule[]>>,
  setBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseInlineModuleEditsReturn {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // The item whose due date is being edited inline, plus its datetime-local draft.
  const [dueEdit, setDueEdit] = useState<{ id: number; value: string } | null>(null);
  // The item whose points are being edited inline, plus its draft value.
  const [pointsEdit, setPointsEdit] = useState<{ id: number; value: string } | null>(null);
  // The item whose type is being changed inline (via its type chip).
  const [typeEdit, setTypeEdit] = useState<number | null>(null);

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

  return {
    drafts, setDrafts, confirmId, setConfirmId, dueEdit, setDueEdit, pointsEdit, setPointsEdit, typeEdit, setTypeEdit,
    run, saveModuleName, toggleModule, moveModule, removeModule, saveItemTitle, saveDueEdit, savePointsEdit,
    changeItemType, toggleItem, moveItem, indentItem, removeItem,
  };
}
