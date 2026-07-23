"use client";

import type React from "react";
import { useState } from "react";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { DATED_TYPES } from "../constants";
import { itemKey } from "../utils";

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
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number }>;
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

  return {
    moduleSearch, setModuleSearch, moduleSearchLc, moduleMatches, visibleModules, itemVisible,
    selected, setSelected, selectedModules, setSelectedModules,
    selectedItems, allKeys, allSelected, toggleAll, clearSelection, toggleItemSelected, selectByKind,
    toggleModuleItems, allModuleIds, allModulesSelected, toggleAllModules, toggleModuleSelected,
  };
}
