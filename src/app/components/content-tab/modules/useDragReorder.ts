"use client";

import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { updateModuleAction, updateModuleItemAction } from "../../../actions";
import { itemKey } from "../utils";

export interface UseDragReorderReturn {
  itemNodes: React.MutableRefObject<Map<number, HTMLElement | null>>;
  moduleNodes: React.MutableRefObject<Map<number, HTMLElement | null>>;
  drag: { moduleId: number; itemId: number } | null;
  setDrag: React.Dispatch<React.SetStateAction<{ moduleId: number; itemId: number } | null>>;
  dragOverItem: number | null;
  setDragOverItem: React.Dispatch<React.SetStateAction<number | null>>;
  dragOverModule: number | null;
  setDragOverModule: React.Dispatch<React.SetStateAction<number | null>>;
  moduleDrag: number | null;
  setModuleDrag: React.Dispatch<React.SetStateAction<number | null>>;
  dragOverModuleRow: number | null;
  setDragOverModuleRow: React.Dispatch<React.SetStateAction<number | null>>;
  isDraggingItem: (moduleId: number, itemId: number) => boolean;
  performMove: (targetModuleId: number, beforeItemId: number | null) => void;
  performModuleMove: (targetId: number) => void;
}

// Drag-and-drop reordering for module items and whole modules, with a FLIP
// animation (remember each row's DOM position just before a move, then slide
// it from the old spot to the new one via the Web Animations API).
export function useDragReorder(
  modules: CanvasModule[],
  setModules: React.Dispatch<React.SetStateAction<CanvasModule[]>>,
  selected: Set<string>,
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>,
  courseUrl: string,
  acronym: string | undefined,
  setBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void,
  run: (fn: () => Promise<{ error: string } | unknown>, fallbackMsg: string) => Promise<void>
): UseDragReorderReturn {
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

  const [drag, setDrag] = useState<{ moduleId: number; itemId: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const [dragOverModule, setDragOverModule] = useState<number | null>(null);
  // Dragging a whole module to reorder it: the grabbed module's id, and the
  // module card currently hovered as a drop target. Kept separate from the item
  // drag state above so an item drag and a module drag never trip each other.
  const [moduleDrag, setModuleDrag] = useState<number | null>(null);
  const [dragOverModuleRow, setDragOverModuleRow] = useState<number | null>(null);

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

  return {
    itemNodes, moduleNodes, drag, setDrag, dragOverItem, setDragOverItem, dragOverModule, setDragOverModule,
    moduleDrag, setModuleDrag, dragOverModuleRow, setDragOverModuleRow, isDraggingItem, performMove, performModuleMove,
  };
}
