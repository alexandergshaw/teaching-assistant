"use client";

import type React from "react";
import { useState } from "react";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import type { SelectedMaterialItem } from "@/lib/lms-generation/materials";
import { DATED_TYPES } from "../constants";
import {
  exportItemKey,
  exportModuleKey,
  exportModuleKeyPrefix,
  itemKey,
  liveModuleIdsFromKeys,
  liveModuleKey,
  liveModuleKeyPrefix,
  parseItemKey,
  parseModuleKey,
  repoItemKey,
  repoModuleKey,
  repoModuleKeyPrefix,
  type ItemSource,
} from "../utils";
import { containerItemKeys, toggleContainerItems } from "./moduleItemSelection";

export interface UseModuleSelectionReturn {
  moduleSearch: string;
  setModuleSearch: (v: string) => void;
  moduleSearchLc: string;
  moduleMatches: (m: CanvasModule) => boolean;
  visibleModules: CanvasModule[];
  itemVisible: (m: CanvasModule, it: CanvasModuleItem) => boolean;
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Discriminated module-selection Set: `liveModuleKey(id)` /
   * `exportModuleKey(ref)` entries, mixed. Replaces the old `Set<number>` -
   * see utils.ts's own header comment on why a bare numeric id cannot name
   * an export-sourced module. */
  selectedModules: Set<string>;
  setSelectedModules: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Backward-compatible DERIVED view of `selectedModules`: only the live
   * (Canvas-numeric) ids, for consumers that can only ever act on a real
   * Canvas module (useBulkModuleActions.ts's publish/delete/add-to-module -
   * out of this change's scope, and correctly so, since none of those
   * operations has an export-sourced counterpart). Recomputed from
   * `selectedModules` on every call - see liveModuleIdsFromKeys (utils.ts). */
  liveModuleIds: Set<number>;
  /** Shimmed setter for the derived view above: rewrites only the LIVE
   * portion of `selectedModules`, leaving any export-sourced or repo-sourced
   * key untouched. Lets a Set<number>-typed consumer (useBulkModuleActions.ts)
   * keep writing through this hook's single real Set<string> state without
   * ever seeing the discriminated key format itself. */
  setLiveModuleIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }>;
  /** Widened sibling of `selectedItems()`: scans BOTH the live `modules`
   * tree AND (when supplied) a parsed course-export tree, returning the
   * fully-discriminated SelectedMaterialItem shape lms-generation's own
   * gatherSelectionMaterials/gatherExportItem consume directly - no caller
   * needs to reconstruct a key from parts. `selectedItems()` above is left
   * exactly as it was (live-only, un-keyed) for useBulkItemActions.ts, whose
   * every operation (publish, due dates, move, delete...) is itself
   * Canvas-only and therefore has no export-sourced counterpart either. */
  selectedMaterialItems: () => SelectedMaterialItem[];
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
  /** Toggles a LIVE module by its numeric Canvas id - the only module kind
   * ModuleCard ever renders a checkbox for today. Builds/tests
   * `liveModuleKey(id)` internally, mirroring toggleItemSelected's own
   * build-the-key-internally shape. */
  toggleModuleSelected: (id: number) => void;
}

// ── Pure selection-pruning helpers (exported for unit tests) ───────────────
// Selection keys are itemKey's discriminated "live:<moduleId>:<itemId>"
// strings (see itemKey / exportItemKey / repoItemKey / parseItemKey,
// ../utils), and module keys are the mirrored "live:<id>" / "export:<ref>" /
// "repo:<ref>" scheme (liveModuleKey / exportModuleKey / repoModuleKey /
// parseModuleKey, ../utils). `modules` is a live CanvasModule[] tree;
// `exportModules` and `repoModules`, when supplied, are a parsed
// course-export tree and a paired-repo tree respectively - any of the three
// can be absent, in which case that source's keys are left exactly as found
// (nothing to confirm or refute them against), never guessed at.

// Drop every LIVE item key belonging to one module. Keys are prefix-matched
// on "live:${moduleId}:" - the separator after the id must be part of the
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

// Drop every EXPORT item key belonging to one export module - the export
// counterpart to withoutModuleKeys above, same trailing-separator collision
// guard via exportModuleKeyPrefix (a module ref of "1" must not also match a
// module ref of "12").
export function withoutExportModuleKeys(selected: Set<string>, moduleRef: string): Set<string> {
  const prefix = exportModuleKeyPrefix(moduleRef);
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

// Drop every REPO item key belonging to one repo module (a matched
// assignment folder) - the repo counterpart to withoutModuleKeys/
// withoutExportModuleKeys above, same trailing-separator collision guard via
// repoModuleKeyPrefix (a folder ref of "assignments/module_1" must not also
// match "assignments/module_12").
export function withoutRepoModuleKeys(selected: Set<string>, moduleRef: string): Set<string> {
  const prefix = repoModuleKeyPrefix(moduleRef);
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

// Drop one LIVE item's key. Same-reference no-op when it wasn't selected.
export function withoutItemKey(selected: Set<string>, moduleId: number, itemId: number): Set<string> {
  const key = itemKey(moduleId, itemId);
  if (!selected.has(key)) return selected;
  const next = new Set(selected);
  next.delete(key);
  return next;
}

// Drop one EXPORT item's key - the export counterpart to withoutItemKey.
export function withoutExportItemKey(selected: Set<string>, moduleRef: string, itemRef: string): Set<string> {
  const key = exportItemKey(moduleRef, itemRef);
  if (!selected.has(key)) return selected;
  const next = new Set(selected);
  next.delete(key);
  return next;
}

// Drop one REPO item's key - the repo counterpart to withoutItemKey/
// withoutExportItemKey.
export function withoutRepoItemKey(selected: Set<string>, moduleRef: string, itemRef: string): Set<string> {
  const key = repoItemKey(moduleRef, itemRef);
  if (!selected.has(key)) return selected;
  const next = new Set(selected);
  next.delete(key);
  return next;
}

// Drop one module key (live, export or repo - the caller already has the full,
// discriminated key, so there is nothing source-specific left to do here).
// Same-reference no-op when the key wasn't selected.
export function withoutModuleKey(selectedModules: Set<string>, moduleKey: string): Set<string> {
  if (!selectedModules.has(moduleKey)) return selectedModules;
  const next = new Set(selectedModules);
  next.delete(moduleKey);
  return next;
}

export interface PrunedSelection {
  selected: Set<string>;
  selectedModules: Set<string>;
}

// The non-live subset of a discriminated module-key Set - export and repo
// keys alike. This is the exact preservation rule `setLiveModuleIds` (below)
// needs when it rewrites only the live portion of `selectedModules`: every
// non-live key must come through untouched, regardless of which non-live
// source it names. Pulled out as its own pure, exported function (rather
// than left inline in the closure) so this rule - specifically, that it is
// NOT hardcoded to "export" only - is unit-testable directly, the same way
// this file's other selection-Set transforms are.
export function nonLiveModuleKeys(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    const parsed = parseModuleKey(key);
    if (parsed && parsed.source !== "live") out.add(key);
  }
  return out;
}

// Minimal shape of a paired repo's tree, scoped to exactly what pruning
// needs in order to confirm/refute a repo-sourced selection key: each
// matched module's ref (the assignment folder's tree path, e.g.
// "assignments/module_01") and the refs (tree paths) of the items selectable
// under it. This is deliberately NOT the richer view-model the sibling
// repo-folder-tree.ts / repo-module-mapping.ts modules build (nested tree
// nodes, mapping confidence, titles, README content, ...) - this hook only
// ever needs to answer "does this ref still exist in the tree", so it
// defines its own minimal local shape rather than importing (and coupling
// selection-pruning to the shape of) theirs. Any richer repo tree a future
// caller has can be reduced to this before being passed in here.
export interface RepoModuleRefs {
  ref: string;
  itemRefs: string[];
}

// Prune a selection down to what still exists in `modules` (and, when
// supplied, `exportModules` / `repoModules`): drop every module key that's
// gone (and, via withoutModuleKeys/withoutExportModuleKeys/
// withoutRepoModuleKeys, every item key filed under it), then sweep any
// remaining item key whose specific item is gone even though its module
// survived. Returns the SAME Set references (both of them) when nothing
// needed pruning, so a caller can skip a state update with `!==`.
//
// `exportModules` and `repoModules` are each null/undefined whenever no
// tree of that source has been supplied (today, always reachable this way
// for both - see this hook's own header comment). In that case an
// "export:" or "repo:" key is left exactly as it was before that tree
// parameter existed: there is nothing to confirm or refute it against, so
// guessing would risk silently dropping a still-valid selection - for repo
// keys specifically, this is what stops every repo selection from being
// swept on the first render before the repo tree has finished loading.
// Passing a tree (even an empty one) makes that source's keys just as
// prunable as live ones always have been.
export function pruneSelectionForModules(
  modules: CanvasModule[],
  exportModules: CartridgeModule[] | null | undefined,
  selected: Set<string>,
  selectedModules: Set<string>,
  repoModules?: RepoModuleRefs[] | null
): PrunedSelection {
  const liveModuleKeys = new Set(modules.map((m) => liveModuleKey(m.id)));
  const liveItemKeys = new Set<string>();
  for (const mod of modules) for (const it of mod.items) liveItemKeys.add(itemKey(mod.id, it.id));

  // null (not an empty Set) means "no export tree was supplied" - distinct
  // from an empty Set, which means "a tree was supplied and it is empty" (in
  // which case every export key IS confirmed stale, correctly).
  const exportModuleKeys = exportModules
    ? new Set(exportModules.filter((m) => m.identifier).map((m) => exportModuleKey(m.identifier!)))
    : null;
  const exportItemKeys = exportModules
    ? new Set(
        exportModules.flatMap((m) =>
          m.identifier ? m.items.filter((it) => it.identifier).map((it) => exportItemKey(m.identifier!, it.identifier!)) : []
        )
      )
    : null;

  // Same null-vs-empty-Set distinction as exportModuleKeys/exportItemKeys
  // above, mirrored for the repo source.
  const repoModuleKeys = repoModules ? new Set(repoModules.map((m) => repoModuleKey(m.ref))) : null;
  const repoItemKeys = repoModules
    ? new Set(repoModules.flatMap((m) => m.itemRefs.map((itemRef) => repoItemKey(m.ref, itemRef))))
    : null;

  let nextSelectedModules = selectedModules;
  let nextSelected = selected;
  for (const key of selectedModules) {
    const parsed = parseModuleKey(key);
    if (!parsed) continue; // malformed - left in place, mirrors the item-key sweep's own caveat below
    const stillLive = parsed.source === "live" && liveModuleKeys.has(key);
    const stillExported = parsed.source === "export" && exportModuleKeys?.has(key);
    const stillInRepo = parsed.source === "repo" && repoModuleKeys?.has(key);
    if (stillLive || stillExported || stillInRepo) continue;
    if (parsed.source === "export" && !exportModuleKeys) continue; // no tree to confirm/refute against
    if (parsed.source === "repo" && !repoModuleKeys) continue; // no tree to confirm/refute against

    nextSelectedModules = withoutModuleKey(nextSelectedModules, key);
    nextSelected =
      parsed.source === "live"
        ? withoutModuleKeys(nextSelected, Number(parsed.ref))
        : parsed.source === "export"
          ? withoutExportModuleKeys(nextSelected, parsed.ref)
          : withoutRepoModuleKeys(nextSelected, parsed.ref);
  }

  for (const key of nextSelected) {
    if (liveItemKeys.has(key)) continue;
    if (exportItemKeys?.has(key)) continue;
    if (repoItemKeys?.has(key)) continue;
    const parsed = parseItemKey(key);
    if (!parsed) continue; // malformed - left in place, matching the pre-existing caveat
    if (parsed.source === "live") {
      nextSelected = withoutItemKey(nextSelected, Number(parsed.moduleRef), Number(parsed.itemRef));
    } else if (parsed.source === "export" && exportItemKeys) {
      // exportItemKeys is non-null here (a tree was supplied) and this key
      // wasn't found in it, so it's confirmed stale - drop it the same way
      // withoutItemKey always has for a live key.
      nextSelected = withoutExportItemKey(nextSelected, parsed.moduleRef, parsed.itemRef);
    } else if (parsed.source === "repo" && repoItemKeys) {
      // repoItemKeys is non-null here (a tree was supplied) and this key
      // wasn't found in it, so it's confirmed stale - drop it the same way
      // withoutItemKey always has for a live key.
      nextSelected = withoutRepoItemKey(nextSelected, parsed.moduleRef, parsed.itemRef);
    }
    // else: an export or repo key with no tree of that source supplied is
    // left in place - nothing to confirm it against.
  }

  return { selected: nextSelected, selectedModules: nextSelectedModules };
}

export function useModuleSelection(
  modules: CanvasModule[],
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  /** A parsed course-export tree, when one is available - optional and
   * defaulting to none so every existing caller (ModulesView.tsx passes only
   * `modules`/`setNote` today - nothing yet threads ContentTab's
   * exportContentRef this far down, see docs/REGRESSION.md entry 263's own
   * "Limits" section) compiles and behaves identically. Supplying it makes
   * `selectedMaterialItems()` able to resolve an export-sourced selection key
   * and makes the self-pruning effect below able to confirm/drop a stale
   * export key, instead of leaving it untouched. */
  exportModules?: CartridgeModule[] | null,
  /** A paired repo's tree, reduced to `RepoModuleRefs`, when one is
   * available - optional and defaulting to none for the same reason
   * `exportModules` is: no caller threads a repo tree this far down yet
   * (the repo picker, tree fetch and folder-to-module mapping are separate,
   * concurrently-built pieces - see docs/repo-pairing-in-modules-acceptance-
   * criteria.md AC1-AC3). Supplying it lets the self-pruning effect below
   * confirm/drop a stale repo key instead of leaving it untouched - see
   * `pruneSelectionForModules`'s own doc comment on why an absent tree must
   * NOT be treated as "confirmed empty". */
  repoModules?: RepoModuleRefs[] | null
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
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());

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
  // `modules` (or `exportModules`, or `repoModules`) changes.
  const [prunedFor, setPrunedFor] = useState(modules);
  const [prunedForExport, setPrunedForExport] = useState(exportModules);
  const [prunedForRepo, setPrunedForRepo] = useState(repoModules);
  if (modules !== prunedFor || exportModules !== prunedForExport || repoModules !== prunedForRepo) {
    setPrunedFor(modules);
    setPrunedForExport(exportModules);
    setPrunedForRepo(repoModules);
    const pruned = pruneSelectionForModules(modules, exportModules, selected, selectedModules, repoModules);
    if (pruned.selectedModules !== selectedModules) setSelectedModules(pruned.selectedModules);
    if (pruned.selected !== selected) setSelected(pruned.selected);
  }

  // `modules` is a live CanvasModule[] tree, so every match here is "live:"
  // sourced today; the field is carried on each result (rather than left for
  // a caller to re-derive by parsing the key) so a future export-aware
  // caller can branch on `source` without ever touching a key string.
  // LIVE-ONLY, UNCHANGED, AND MUST STAY THAT WAY (AC7 of
  // docs/repo-pairing-in-modules-acceptance-criteria.md) - see this
  // function's own doc comment on the UseModuleSelectionReturn interface for
  // why (useBulkItemActions.ts compat). This is what keeps every Canvas
  // write reachable through BulkItemsSection (publish, due dates, points,
  // rubrics, submission type, move, remove, delete) structurally blind to a
  // repo-sourced row: a repo key can never appear in this function's output,
  // so none of those write paths can ever be invoked against one. Do not
  // widen this to include export/repo sources - that is `selectedMaterialItems`
  // below, which feeds only the read-only generation path.
  const selectedItems = (): Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }> => {
    const out: Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }> = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        if (selected.has(itemKey(mod.id, it.id))) out.push({ item: it, moduleId: mod.id, source: "live" });
      }
    }
    return out;
  };

  // Scans BOTH the live and export sources - see this function's own doc
  // comment on UseModuleSelectionReturn. A module/item with no `identifier`
  // never had a key it could have been selected under in the first place
  // (exportItemKey needs both refs), so it is simply skipped rather than
  // guessed at.
  //
  // DELIBERATELY NOT WIDENED TO REPO HERE. A repo arm belongs here eventually
  // (AC8 of docs/repo-pairing-in-modules-acceptance-criteria.md treats
  // generation as repo-capable, since reading a repo file's text is a read,
  // not a Canvas write), but `SelectedMaterialItem` (src/lib/lms-generation/
  // materials.ts) is a closed union owned by a different in-flight change;
  // adding a `{source: "repo"; ...}` arm here without widening that union
  // first breaks the type. A later wave must: (1) add the repo arm to
  // `SelectedMaterialItem` and to `gatherLiveItem`/`gatherExportItem`'s fork
  // (materials.ts:246, per AC6), (2) then add the matching push here scanning
  // `repoModules ?? []` the same way the export loop below scans
  // `exportModules ?? []`, keyed by `repoItemKey(mod.ref, itemRef)`.
  const selectedMaterialItems = (): SelectedMaterialItem[] => {
    const out: SelectedMaterialItem[] = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        const key = itemKey(mod.id, it.id);
        if (selected.has(key)) out.push({ source: "live", key, moduleId: mod.id, item: it });
      }
    }
    for (const mod of exportModules ?? []) {
      if (!mod.identifier) continue;
      for (const it of mod.items) {
        if (!it.identifier) continue;
        const key = exportItemKey(mod.identifier, it.identifier);
        if (selected.has(key)) out.push({ source: "export", key, moduleRef: mod.identifier, item: it });
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

  // Select (or, when all are already selected, deselect) every item in one
  // module - AC6's consolidated selector (moduleItemSelection.ts) now owns
  // both the key-building and the toggle loop this closure used to inline.
  //
  // DELIBERATELY RAW, not filter-scoped (JOB 4 / AC7 of
  // docs/module-item-selection-discoverability-acceptance-criteria.md):
  // `m.items` is used whole, exactly as before this change, ignoring
  // `moduleSearchLc` - stated explicitly in the button's own tooltip
  // (ModuleCard.tsx, via moduleItemSelection.ts's selectItemsButtonTooltip)
  // rather than left silent. `toggleAll` above stays filter-scoped; the two
  // behaviours differ on purpose (docs/REGRESSION.md:19939-19943) and both
  // have call sites.
  const toggleModuleItems = (m: CanvasModule) => {
    const keys = containerItemKeys({ source: "live", moduleRef: String(m.id), itemRefs: m.items.map((it) => String(it.id)) });
    if (keys.length === 0) return;
    setSelected((prev) => toggleContainerItems(prev, keys));
  };

  // Module-level selection (for deleting / publishing whole modules). Scoped to
  // the visible modules so a filtered list only selects what's on screen.
  // LIVE-only - visibleModules is always derived from the live `modules` tree
  // (there is no export-module UI to select-all against yet).
  const allModuleIds = visibleModules.map((mod) => mod.id);
  const allModulesSelected = allModuleIds.length > 0 && allModuleIds.every((id) => selectedModules.has(liveModuleKey(id)));
  const toggleAllModules = () =>
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (allModulesSelected) for (const id of allModuleIds) next.delete(liveModuleKey(id));
      else for (const id of allModuleIds) next.add(liveModuleKey(id));
      return next;
    });
  const toggleModuleSelected = (id: number) =>
    setSelectedModules((prev) => {
      const next = new Set(prev);
      const key = liveModuleKey(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Derived Set<number> view of `selectedModules`, and a shimmed setter that
  // writes back through the real Set<string> state - see this hook's own
  // doc comment on UseModuleSelectionReturn for why these exist.
  const liveModuleIds = liveModuleIdsFromKeys(selectedModules);
  const setLiveModuleIds: React.Dispatch<React.SetStateAction<Set<number>>> = (action) => {
    setSelectedModules((prevKeys) => {
      const prevLiveIds = liveModuleIdsFromKeys(prevKeys);
      const nextLiveIds = typeof action === "function" ? (action as (p: Set<number>) => Set<number>)(prevLiveIds) : action;
      // Preserve every non-live key untouched - export and repo alike (see
      // nonLiveModuleKeys's own doc comment). This filter used to be
      // `parsed.source === "export"` inline here, which would have silently
      // DROPPED every repo module key on any write through this shim
      // (useBulkModuleActions.ts's publish/delete/add-to-module).
      const next = nonLiveModuleKeys(prevKeys);
      for (const id of nextLiveIds) next.add(liveModuleKey(id));
      return next;
    });
  };

  return {
    moduleSearch, setModuleSearch, moduleSearchLc, moduleMatches, visibleModules, itemVisible,
    selected, setSelected, selectedModules, setSelectedModules, liveModuleIds, setLiveModuleIds,
    selectedItems, selectedMaterialItems, allKeys, allSelected, toggleAll, clearSelection, toggleItemSelected, selectByKind,
    toggleModuleItems, allModuleIds, allModulesSelected, toggleAllModules, toggleModuleSelected,
  };
}
