"use client";

// Flat-list selection for CourseItemsView (Contract 2,
// docs/assignments-quizzes-tabs-acceptance-criteria.md). Modelled on
// useKbSelection.ts's shape (a flat `Set<string>` with
// toggle/selectAllVisible/clear plus a pure prune-against-current-list) -
// deliberately NOT useModuleSelection.ts, whose keys are
// "live:<moduleId>:<itemId>" and whose pruning walks a `CanvasModule[]` tree
// (D3): a flat assignments/quizzes list has no module to fabricate a key
// from, and utils.ts's own itemKey family warns against a synthetic id
// (a fabricated key could collide with a real one).
//
// Unlike useKbSelection, this hook takes no institution/course-scoping key
// (Contract 2's signature is `useFlatItemSelection(currentIds)` only) and so
// deliberately does NOT persist the selection to localStorage: there is no
// key to scope a persisted value by (two different courses, or the
// Assignments vs Quizzes tab, share the same hook with no identifier to
// namespace a stored Set under), and useModuleSelection - the other
// selection hook in this folder - does not persist either. A selection is
// session-only state here, exactly as ModulesView's already is.

import { useCallback, useState } from "react";

// ── Pure Set-algebra (exported for unit tests) ──────────────────────────────

/** Toggle one id in/out of the selection. Always returns a NEW Set. */
export function toggleSelected(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** True when every one of `visibleIds` is currently selected. Empty
 *  `visibleIds` is never "all selected" - there is nothing to select all of
 *  (mirrors FilesView's `allShownSelected` guard, `shown.length > 0 && ...`). */
export function allVisibleSelected(selected: Set<string>, visibleIds: readonly string[]): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}

/**
 * The select-all/Clear affordance's core (A4): merges `visibleIds` into the
 * selection, or - when every one of them is already selected - unmerges them
 * back out. A search filter that narrows what's visible only ever touches
 * what's shown; anything selected outside `visibleIds` (a previous selection
 * from before the filter was typed) is left untouched either way.
 */
export function mergeOrClearVisible(selected: Set<string>, visibleIds: readonly string[]): Set<string> {
  const allSelected = allVisibleSelected(selected, visibleIds);
  const next = new Set(selected);
  if (allSelected) {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return next;
}

/**
 * Drop any selected id that is no longer in `currentIds` (A5) - the item was
 * deleted, or a reload dropped it. Returns the SAME Set reference when
 * nothing needed pruning, so a caller can skip a state update with `!==` -
 * the compare-and-adjust idiom `useFlatItemSelection` relies on below.
 */
export function pruneSelection(selected: Set<string>, currentIds: readonly string[]): Set<string> {
  if (selected.size === 0) return selected;
  const validIds = new Set(currentIds);
  let changed = false;
  const next = new Set<string>();
  for (const id of selected) {
    if (validIds.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : selected;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface UseFlatItemSelectionReturn {
  /** The current bulk-selected item ids. */
  selected: Set<string>;
  /** Toggle one row's checkbox on/off. */
  toggle: (id: string) => void;
  /** Merge/unmerge `visibleIds` into the selection (A4) - pass the ids the
   *  view is actually rendering right now (the filtered/searched list). */
  selectAllVisible: (visibleIds: readonly string[]) => void;
  /** Empty the selection entirely (the bulk bar's Clear). */
  clear: () => void;
  /** Whether every one of `visibleIds` is currently selected - drives the
   *  "select all" checkbox's checked state. */
  allVisibleSelected: (visibleIds: readonly string[]) => boolean;
}

/**
 * `currentIds` must be a referentially-stable array across renders where the
 * underlying list has not changed (e.g. `useMemo(() => items.map(i => i.id),
 * [items])` at the call site) - the same contract useKbSelection.ts's `pages`
 * parameter already relies on for its own compare-and-adjust prune. A fresh
 * array literal recomputed every render would still prune correctly (the
 * comparison below just re-runs, and `pruneSelection` returns the SAME Set
 * reference when nothing changed, so no extra `setSelected` fires), but it
 * would burn a wasted render each time; passing a memoized list keeps this
 * hook's own state settling in one render, exactly like useKbSelection's.
 */
export function useFlatItemSelection(currentIds: readonly string[]): UseFlatItemSelectionReturn {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Prune during render (compare-and-adjust), never inside a useEffect - this
  // repo's eslint rejects setState reached synchronously from an effect (see
  // AGENTS.md's set-state-in-effect idiom), and useKbSelection.ts /
  // useModuleSelection.ts both already use this same render-time pattern for
  // their own selection pruning.
  const [prunedForIds, setPrunedForIds] = useState(currentIds);
  if (currentIds !== prunedForIds) {
    setPrunedForIds(currentIds);
    const pruned = pruneSelection(selected, currentIds);
    if (pruned !== selected) setSelected(pruned);
  }

  const toggle = useCallback((id: string) => {
    setSelected((prev) => toggleSelected(prev, id));
  }, []);

  const selectAllVisible = useCallback((visibleIds: readonly string[]) => {
    setSelected((prev) => mergeOrClearVisible(prev, visibleIds));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const allVisibleSelectedFn = useCallback(
    (visibleIds: readonly string[]) => allVisibleSelected(selected, visibleIds),
    [selected]
  );

  return { selected, toggle, selectAllVisible, clear, allVisibleSelected: allVisibleSelectedFn };
}
