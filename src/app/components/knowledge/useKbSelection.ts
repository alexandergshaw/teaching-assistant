"use client";

// Multi-select (checkbox) state for the Knowledge tab's page tree - the
// bulk-action selection driving the tree's per-row checkboxes, the
// select-all/Clear affordance, and the bulk bar's "Ask AI" action
// (S1-S6, A1 in docs/knowledge-bulk-actions-ask-ai-acceptance-criteria.md).
//
// Deliberately separate from useKbPageTree's `selectedId` (the single page
// currently open in the right-hand editor pane): ticking a checkbox never
// navigates or changes editor state, so it must never route through
// KnowledgeTab.tsx's confirmDiscard() guard the way selectPage() does (S2) -
// this hook has no dependency on that guard at all.
//
// Persisted per institution the same way useKbPageTree's expanded-node set
// is - a ta-kb- prefixed key, parseInstitutionMap, Array.from(set) on write
// (see knowledge-helpers.ts's readBulkSelectedIds/writeBulkSelectedIds) -
// and self-prunes against the current `pages` list during render via the
// same compare-and-adjust idiom useKbPageTree.ts (:85-93) and
// useModuleSelection.ts (:279-287) both use: state is adjusted synchronously
// during render, never from a setState reached inside an effect (see
// AGENTS.md's set-state-in-effect idiom - eslint rejects that here).
//
// B5 persistence decision: this selection is not just UI state (like
// `expanded` above) - it silently becomes the context handed to the model
// for grading and reply-drafting (KnowledgeTab.tsx's askAiAboutSelection /
// startRecordingWithSelection / startGradingWithSelection). A selection an
// instructor made last month, forgot about, and would never have re-made
// today must not go on shaping feedback a student reads - so a fresh page
// load (this hook's initial mount) always starts EMPTY, never reads
// readBulkSelectedIds. What DOES stay backed by localStorage is switching
// between institutions within one still-open session (the `active !==
// prevActive` branch below) - that is ordinary in-session navigation, not a
// selection surviving a reload, and losing it on every institution tab
// click would make the bulk-action feature unusable for anyone working two
// schools in one sitting. The write-through (toggle/selectAllVisible/clear
// below) is left in place so that within-session round trip keeps working;
// only the "resurrect it after a reload" read is removed.
//
// K6 fix: "Start recording"/"Grade via recording" navigate to a DIFFERENT
// top-level tab BY DESIGN (page.tsx keeps that tab's own component mounted
// permanently - see recording-launch.ts's own header comment - but unmounts
// KnowledgeTab). Coming back therefore REMOUNTS this hook, and until this
// fix that always meant `useState(() => new Set())` - the very selection
// the instructor just used to launch the recording was gone the moment they
// looked back at it. That is a different event from a reload (B5's case)
// even though this hook cannot tell them apart from `active`/`prevActive`
// alone (both look like "fresh mount, nothing stored yet"): a reload
// re-evaluates every JS module from scratch, while a same-session tab
// switch does not touch the module graph at all - only React unmounts this
// component. `sessionSelectionCache` below is a plain module-scoped `Map`,
// the exact idiom recording-launch.ts's own `pendingKnowledgeContext`
// already uses for a one-session, not-in-localStorage value: a hard reload
// re-initializes it to empty for free (the module re-evaluates), while a
// KnowledgeTab unmount/remount within the same running session leaves it
// untouched, so the lazy useState initializer below picks the selection
// back up. This is deliberately NOT localStorage (that would resurrect a
// month-old selection on every future reload too, exactly what B5 forbids)
// and deliberately NOT the same object identity as the per-institution
// `readBulkSelectedIds`/`writeBulkSelectedIds` localStorage pair, which
// keeps serving the reload-vs-switch distinction those already draw.

import { useCallback, useState } from "react";
import type { InstitutionPage } from "@/lib/knowledge-base";
import { allVisibleSelected, readBulkSelectedIds, writeBulkSelectedIds } from "./knowledge-helpers";

/** Module-scoped, per-institution, NOT persisted to localStorage - see the
 *  module comment above. Cleared for free by a hard reload; survives a
 *  same-session KnowledgeTab unmount/remount. */
const sessionSelectionCache = new Map<string, Set<string>>();

/** Write-through used by every mutation below: keeps the per-institution
 *  localStorage copy (in-session institution-switch convenience, B5) and
 *  the module-scoped session cache (K6's navigate-away-and-back fix) in
 *  sync with each other on every change, so neither can drift from what the
 *  hook's own `selected` state actually holds. */
function persistSelection(institution: string, next: Set<string>): void {
  sessionSelectionCache.set(institution, next);
  if (institution) writeBulkSelectedIds(institution, next);
}

// ── Pure Set-algebra (exported for unit tests - X1) ─────────────────────────

/** Toggle one id in/out of the selection. Always returns a NEW Set (unlike
 *  pruneSelection/mergeOrClearVisible below, a single toggle always changes
 *  something, so there is no same-reference no-op case to preserve). */
export function toggleSelected(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * The select-all/Clear affordance's core (S3): merges `visibleIds` into the
 * selection, or - when every one of them is already selected - unmerges
 * them back out. Mirrors `toggleAll` in useModuleSelection.ts exactly (merge
 * when not all visible are selected, unmerge when they all are), so a
 * search/collapse state that narrows what's visible only ever touches what's
 * shown; anything selected outside `visibleIds` (a collapsed branch, or a
 * previous selection from before a filter was applied) is left untouched
 * either way.
 */
export function mergeOrClearVisible(selected: Set<string>, visibleIds: string[]): Set<string> {
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
 * Drop any selected id that no longer exists in `pages` (S4) - the page was
 * deleted, or the institution just changed and its page list has not
 * finished loading yet. `pages === null` (still loading) is left untouched:
 * there is no valid-id set yet to prune against, and wiping the
 * just-restored selection during the loading flicker between an institution
 * switch and its page list arriving would be wrong. Returns the SAME Set
 * reference when nothing needed pruning, so a caller can skip a state
 * update with `!==` - the compare-and-adjust idiom useKbSelection() below
 * relies on.
 */
export function pruneSelection(selected: Set<string>, pages: InstitutionPage[] | null): Set<string> {
  if (pages === null || selected.size === 0) return selected;
  const validIds = new Set(pages.map((p) => p.id));
  let changed = false;
  const next = new Set<string>();
  for (const id of selected) {
    if (validIds.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : selected;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface UseKbSelectionReturn {
  /** The current bulk-selected page ids. */
  selected: Set<string>;
  /** Toggle one page's checkbox on/off (S1). Never touches `selectedId` or
   *  confirmDiscard() (S2) - the caller wires this straight to the
   *  checkbox's onChange, independent of the row's title-button onClick. */
  toggle: (id: string) => void;
  /** Merge/unmerge `visibleIds` into the selection (S3) - pass the ids
   *  PageTreeView is actually rendering right now (see
   *  knowledge-helpers.ts's visiblePageIds). */
  selectAllVisible: (visibleIds: string[]) => void;
  /** Empty the selection entirely (S3/S6's bulk bar Clear). */
  clear: () => void;
}

export function useKbSelection(active: string, pages: InstitutionPage[] | null): UseKbSelectionReturn {
  // B5/K6: never seed from localStorage on initial mount - a genuine reload
  // always starts empty (B5). The module-scoped `sessionSelectionCache` DOES
  // get consulted here, but that is not a localStorage read: a hard reload
  // re-evaluates this module and resets the cache to empty right along with
  // it (see the module comment above for why that is the distinction that
  // matters), so this line still starts empty on every real reload - it
  // only recovers a selection across a same-session KnowledgeTab
  // unmount/remount (K6's "Start recording" round trip).
  const [selected, setSelected] = useState<Set<string>>(() => sessionSelectionCache.get(active) ?? new Set());

  // Reset on institution change, prune on page-list reload - both during
  // render (compare-and-adjust), never an effect (S4). An institution change
  // wins over pruning when both would apply on the same render: a switch
  // always fully replaces the selection with the NEW institution's own
  // persisted set, so there is nothing of the old institution's selection
  // left to prune against a page list that belongs to a different
  // institution anyway. Mirrors useKbPageTree.ts's own prevActive block and
  // useModuleSelection.ts's prunedFor/prunedForExport pair.
  const [prevActive, setPrevActive] = useState(active);
  const [prunedForPages, setPrunedForPages] = useState(pages);
  if (active !== prevActive) {
    setPrevActive(active);
    setPrunedForPages(pages);
    // B5: restore a persisted selection only for a genuine in-session
    // SWITCH between two already-resolved institutions (prevActive was
    // itself non-empty) - not the initial resolution of `active` from ""
    // (not yet loaded/chosen) to the first real institution, which must
    // start empty per the module comment above, the same as any other
    // fresh mount. Prefers the session cache (kept in sync by
    // persistSelection below) over a fresh localStorage read - both should
    // always agree, but the cache is the value most recently written this
    // session, without the JSON round trip.
    setSelected(
      active && prevActive ? sessionSelectionCache.get(active) ?? readBulkSelectedIds(active) : new Set()
    );
  } else if (pages !== prunedForPages) {
    setPrunedForPages(pages);
    const pruned = pruneSelection(selected, pages);
    if (pruned !== selected) {
      setSelected(pruned);
      if (active) persistSelection(active, pruned);
    }
  }

  // Plain event-handler side effects below (not render, not an effect) -
  // read `selected` from closure and write through directly, exactly the
  // shape useKbPageTree.ts's toggleExpand/expandAncestorsOf already use for
  // their own persisted Set state.
  const toggle = useCallback(
    (id: string) => {
      const next = toggleSelected(selected, id);
      setSelected(next);
      if (active) persistSelection(active, next);
    },
    [selected, active]
  );

  const selectAllVisible = useCallback(
    (visibleIds: string[]) => {
      const next = mergeOrClearVisible(selected, visibleIds);
      setSelected(next);
      if (active) persistSelection(active, next);
    },
    [selected, active]
  );

  const clear = useCallback(() => {
    setSelected(new Set());
    if (active) persistSelection(active, new Set());
  }, [active]);

  return { selected, toggle, selectAllVisible, clear };
}
