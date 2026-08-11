"use client";

import type React from "react";
import { useState } from "react";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { DATED_TYPES } from "../constants";
import { itemKey, liveModuleKeyPrefix, parseItemKey, type ItemSource } from "../utils";

export interface UseModuleSelectionReturn {
  moduleSearch: string;
  setModuleSearch: (v: string) => void;
  moduleSearchLc: string;
  moduleMatches: (m: CanvasModule) => boolean;
  visibleModules: CanvasModule[];
  itemVisible: (m: CanvasModule, it: CanvasModuleItem) => boolean;
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedModules: Set<number>;
  setSelectedModules: React.Dispatch<React.SetStateAction<Set<number>>>;
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }>;
  allKeys: string[];
  allSelected: boolean;
  toggleAll: () => void;
  clearSelection: () => void;
  toggleItemSelected: (moduleId: number, itemId: number) => void;
  selectByKind: (kind: string) => void;
  toggleModuleItems: (m: CanvasModule) => void;
  allModuleIds: number[];
  allModulesSelected: boolean;
  toggleAllModules: () => void;
  toggleModuleSelected: (id: number) => void;
}

// ── Pure selection-pruning helpers (exported for unit tests) ───────────────
// Selection keys are itemKey's discriminated "live:<moduleId>:<itemId>"
// strings (see itemKey / exportItemKey / parseItemKey, ../utils). `modules`
// here is a live CanvasModule[] tree, so every key this hook ever puts into
// `selected` is "live:"-sourced today; the pruning helpers below are scoped
// to that source accordingly (see pruneSelectionForModules).

// Drop every LIVE key belonging to one module. Keys are prefix-matched on
// "live:${moduleId}:" - the separator after the id must be part of the
// prefix, or a bare `startsWith("live:" + moduleId)` would also match module
// 12's key "live:12:7" when dropping module 1's keys (since "live:12:7"
// starts with "live:1"). Returns the same Set reference when nothing changed.
export function withoutModuleKeys(selected: Set<string>, moduleId: number): Set<string> {
  const prefix = liveModuleKeyPrefix(moduleId);
  let changed = false;
  const next = new Set<string>();
  for (const key of selected) {
    if (key.startsWith(prefix)) {
      changed = true;
      continue;
    }
    next.add(key);
  }
  return changed ? next : selected;
}

// Drop one item's key. Same-reference no-op when it wasn't selected.
export function withoutItemKey(selected: Set<string>, moduleId: number, itemId: number): Set<string> {
  const key = itemKey(moduleId, itemId);
  if (!selected.has(key)) return selected;
  const next = new Set(selected);
  next.delete(key);
  return next;
}

// Drop one module id. Same-reference no-op when it wasn't selected.
export function withoutModuleId(selectedModules: Set<number>, moduleId: number): Set<number> {
  if (!selectedModules.has(moduleId)) return selectedModules;
  const next = new Set(selectedModules);
  next.delete(moduleId);
  return next;
}

export interface PrunedSelection {
  selected: Set<string>;
  selectedModules: Set<number>;
}

// Prune a selection down to what still exists in `modules`: drop every module
// id that's gone (and, via withoutModuleKeys, every item key filed under it),
// then sweep any remaining item key whose specific item is gone even though
// its module survived. Returns the SAME Set references (both of them) when
// nothing needed pruning, so a caller can skip a state update with `!==`.
export function pruneSelectionForModules(
  modules: CanvasModule[],
  selected: Set<string>,
  selectedModules: Set<number>
): PrunedSelection {
  const liveModuleIds = new Set(modules.map((m) => m.id));
  const liveItemKeys = new Set<string>();
  for (const mod of modules) for (const it of mod.items) liveItemKeys.add(itemKey(mod.id, it.id));

  let nextSelectedModules = selectedModules;
  for (const id of selectedModules) {
    if (!liveModuleIds.has(id)) nextSelectedModules = withoutModuleId(nextSelectedModules, id);
  }

  let nextSelected = selected;
  for (const id of selectedModules) {
    if (!liveModuleIds.has(id)) nextSelected = withoutModuleKeys(nextSelected, id);
  }
  for (const key of nextSelected) {
    if (liveItemKeys.has(key)) continue;
    // `liveItemKeys` only ever holds "live:" keys (built from `modules`, a
    // live CanvasModule[] tree), so it can only confirm or refute a LIVE key.
    // Reconstruct the live key's ids via the shared parser and drop it the
    // same way withoutItemKey always has. An "export:" key or a malformed one
    // (parseItemKey returns null) is left in place rather than guessed at -
    // `selected` cannot contain an export key today (nothing in this hook
    // produces one; only itemKey does, and it always produces "live:"), so
    // this is forward-looking, not a live gap, mirroring the pre-existing
    // caveat that a key without the expected shape silently fails to prune.
    const parsed = parseItemKey(key);
    if (parsed && parsed.source === "live") {
      nextSelected = withoutItemKey(nextSelected, Number(parsed.moduleRef), Number(parsed.itemRef));
    }
  }

  return { selected: nextSelected, selectedModules: nextSelectedModules };
}

export function useModuleSelection(
  modules: CanvasModule[],
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void
): UseModuleSelectionReturn {
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

  // ── Bulk selection across the module tree ──────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<number>>(new Set());

  // Nothing that removes an item or module (the single-row Delete affordance,
  // a bulk delete, a course switch that swaps in a whole different module
  // tree) ever calls back into this hook's own setters - they all mutate
  // `modules` directly, the single shared source of truth. So rather than a
  // useEffect that resets the Sets on removal (easy to forget to wire up for
  // the next new mutation path, and this repo's eslint rejects setState
  // reached synchronously from an effect - see confirmArming.ts for the same
  // class of problem solved the same way, and useKbPageTree.ts for the same
  // "adjust state during render" idiom used here), a deleted item or module -
  // or an old course's ids that no longer mean anything once a new course's
  // modules load in - is pruned out of the Sets themselves the moment
  // `modules` changes.
  const [prunedFor, setPrunedFor] = useState(modules);
  if (modules !== prunedFor) {
    setPrunedFor(modules);
    const pruned = pruneSelectionForModules(modules, selected, selectedModules);
    if (pruned.selectedModules !== selectedModules) setSelectedModules(pruned.selectedModules);
    if (pruned.selected !== selected) setSelected(pruned.selected);
  }

  // `modules` is a live CanvasModule[] tree, so every match here is "live:"
  // sourced today; the field is carried on each result (rather than left for
  // a caller to re-derive by parsing the key) so a future export-aware
  // caller can branch on `source` without ever touching a key string.
  const selectedItems = (): Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }> => {
    const out: Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }> = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        if (selected.has(itemKey(mod.id, it.id))) out.push({ item: it, moduleId: mod.id, source: "live" });
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

  return {
    moduleSearch, setModuleSearch, moduleSearchLc, moduleMatches, visibleModules, itemVisible,
    selected, setSelected, selectedModules, setSelectedModules,
    selectedItems, allKeys, allSelected, toggleAll, clearSelection, toggleItemSelected, selectByKind,
    toggleModuleItems, allModuleIds, allModulesSelected, toggleAllModules, toggleModuleSelected,
  };
}
