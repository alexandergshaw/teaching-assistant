// Consolidation of "select every item in this container" (AC6,
// docs/module-item-selection-discoverability-acceptance-criteria.md) plus the
// three-state selection predicate that drives AC2 (the module checkbox's
// indeterminate state) and AC5 (the "Select items" button's label) from ONE
// source, so the two can never disagree.
//
// Pure, framework-free (no React, no MUI) - the same discipline
// contentSourceGating.ts and course-tasks-catalog.ts already use in this
// codebase. That is deliberate, not a style preference: vitest here is
// node-env and collects only src/**/*.test.ts (no jsdom, no rendered
// component - see the AC doc's own "Testing reality" section), so a pure,
// exported function is the ONLY thing in this feature that can be tested at
// all. Before this file existed, every one of the functions below was a
// closure inside useModuleSelection's hook body or inline in a component,
// entirely untested.
//
// KEY FORMATS ARE NOT OWNED HERE. Every key this file produces is built
// through itemKey / exportItemKey / repoItemKey (../utils), never a
// hand-rolled template string - the trailing-colon prefix guards those
// functions carry (liveModuleKeyPrefix and friends, relied on by
// useModuleSelection's pruning helpers, pinned at
// useModuleSelection.pruning.test.ts) are load-bearing and must not gain a
// second, independently-drifting definition here.
//
// `expandModuleSelection` (src/lib/lms-generation/materials.ts:497-520)
// HAND-WRITES the same three key templates as string literals rather than
// importing these helpers - DELIBERATELY, because that file keeps zero
// client imports. That is a second, independent definition of one format,
// and this file does NOT unify them (out of scope per AC6). This file's own
// test suite instead pins the two definitions' agreement against a FROZEN
// LITERAL oracle, never against either implementation, per this repo's rule
// that consolidating two implementations disarms a test that used to compare
// them directly.

import { exportItemKey, itemKey, repoItemKey, type ItemSource } from "../utils";

export type { ItemSource };

// -- JOB 1 (AC6) - one selector, parameterised by source --------------------

/**
 * One container whose items can be select-all/deselect-all'd as a unit: a
 * live Canvas module, an export module, or a paired repo's assignment
 * folder. `moduleRef` is that container's own stable ref for its source - a
 * live module's numeric Canvas id (as a string; converted back to a number
 * only when building a `live:` key, since itemKey's own signature is
 * Canvas-numeric), an export module's manifest `identifier`, or a repo
 * folder's tree path. `itemRefs` are the matching per-source refs for
 * exactly the items eligible for selection under it.
 *
 * Exclusion is a CALLER concern, not this file's: an export-sourced
 * instructor-added item carries no `identifier` at all
 * (display-module-tree.ts's `added: true`) and so must never reach
 * `itemRefs` in the first place - see `eligibleItemRefs` below, which is
 * exactly the tool that keeps that filtering in one place instead of
 * reimplemented at each call site.
 */
export interface ModuleItemsContainer {
  source: ItemSource;
  moduleRef: string;
  itemRefs: string[];
}

/**
 * The ONE selection-key builder for "every item in this container" -
 * replaces the three separate key-building code paths this consolidates:
 * `useModuleSelection.toggleModuleItems`'s `itemKey(m.id, it.id)` calls,
 * `ModuleCard`'s export branch's `exportItemKey(m.identifier!, it.identifier!)`
 * calls, and `RepoFoldersSection.toggleAllFilesInFolder`'s
 * `repoItemKey(folder.path, f.path)` calls. Every actual key template is
 * still built by ../utils - see this file's own header comment on why the
 * templates themselves are not reproduced here.
 */
export function containerItemKeys(container: ModuleItemsContainer): string[] {
  const { source, moduleRef, itemRefs } = container;
  if (source === "live") {
    const moduleId = Number(moduleRef);
    return itemRefs.map((ref) => itemKey(moduleId, Number(ref)));
  }
  if (source === "export") return itemRefs.map((ref) => exportItemKey(moduleRef, ref));
  return itemRefs.map((ref) => repoItemKey(moduleRef, ref));
}

/**
 * Reduce a raw item list to the refs eligible for selection, dropping any
 * item `refOf` cannot resolve a ref for. This is the one place the
 * export-sourced "instructor-added items are excluded" rule
 * (ModuleCard.tsx's original ~:152-164) now lives, so it applies identically
 * wherever it is needed instead of being reimplemented ad hoc. For a source
 * that never omits a ref (live items always have a numeric id; repo files
 * always have a path), `refOf` simply never returns null and every item
 * passes through.
 */
export function eligibleItemRefs<T>(items: readonly T[], refOf: (item: T) => string | null | undefined): string[] {
  const refs: string[] = [];
  for (const item of items) {
    const ref = refOf(item);
    if (ref != null && ref !== "") refs.push(ref);
  }
  return refs;
}

/**
 * Select-all/deselect-all for one container's items - replaces the three
 * near-identical toggle closures this consolidates (JOB 1 / AC6). All three
 * shared the same shape once their keys were computed: check whether every
 * key is already selected, then flip every key the same direction. Returns
 * the SAME Set reference (no-op) only when there is nothing to toggle,
 * mirroring this folder's sibling pure Set-transform idiom
 * (useModuleSelection.ts's withoutItemKey and friends).
 */
export function toggleContainerItems(selected: Set<string>, itemKeys: string[]): Set<string> {
  if (itemKeys.length === 0) return selected;
  const state = moduleSelectionState(selected, itemKeys);
  const next = new Set(selected);
  if (state === "all") {
    for (const key of itemKeys) next.delete(key);
  } else {
    for (const key of itemKeys) next.add(key);
  }
  return next;
}

// -- JOB 2 (AC2/AC5) - the three-state predicate, and everything derived ----

/** none: no item selected. some: a partial selection. all: every item selected
 * (and there is at least one item - an empty container is "none", never
 * vacuously "all"). */
export type SelectionState = "none" | "some" | "all";

/**
 * The ONE predicate behind AC2 (the module checkbox's indeterminate state)
 * and AC5 (the "Select items" button's label) - so the two can never
 * disagree, per both ACs' explicit requirement. Takes the already-built key
 * list (from `containerItemKeys`) rather than re-deriving it, so a caller
 * that also needs to toggle those same keys never computes them twice.
 */
export function moduleSelectionState(selected: ReadonlySet<string>, itemKeys: readonly string[]): SelectionState {
  if (itemKeys.length === 0) return "none";
  let selectedCount = 0;
  for (const key of itemKeys) if (selected.has(key)) selectedCount++;
  if (selectedCount === 0) return "none";
  if (selectedCount === itemKeys.length) return "all";
  return "some";
}

/**
 * A checked/indeterminate pair derived purely from an ITEM-selection
 * `SelectionState`. NOT wired to the module checkbox any more - see
 * docs/bulk-bar-reorganization-acceptance-criteria.md section 3c, which
 * overrode the original AC2/AC7 design this function used to back.
 *
 * SETTLED BY SECTION 3c: an earlier draft of AC2 drove the module checkbox's
 * `checked`/`indeterminate` from this function's output (an item-selection
 * signal) while its `onChange` kept writing `selectedModules` (a
 * module-selection Set, per AC3). Clicking the checkbox therefore produced
 * no visible change, and vice versa - section 3c calls that outcome "a lie
 * told by the UI" and states the rule directly: a control's visual state
 * must reflect the state that control writes. AC2a now reads the checkbox
 * straight from `selectedModules.has(...)` - the same Set its own `onChange`
 * writes - with no indeterminate state at all, because module selection is
 * genuinely binary. Both `ModuleCard.tsx` and `RepoFoldersSection.tsx` say so
 * directly in their own header comments, next to the code that replaced this
 * function's old call site.
 *
 * KEPT, NOT DELETED (AC2d): `SelectionState`'s three-state meaning did not go
 * away - AC2b keeps it entirely on the "Select items" button's LABEL
 * (`selectItemsButtonLabel`, below), the control that actually acts on
 * items, where a partial state is meaningful. This function remains as the
 * reusable checked/indeterminate mapping for that kind of control, but it
 * must not be reattached to the MODULE checkbox - that is exactly the
 * design section 3c reverted.
 */
export function moduleCheckboxVisualState(state: SelectionState): { checked: boolean; indeterminate: boolean } {
  return { checked: state === "all", indeterminate: state === "some" };
}

/**
 * The "Select items" button's label (AC5) - THREE distinct labels, not the
 * previous two-state ("Select items" / "Deselect items") flip, so a partial
 * selection is visible without opening the module. `itemNoun` lets each of
 * the three call sites use its own noun ("items" for modules, "files" for a
 * repo folder) without a second copy of this function.
 */
export function selectItemsButtonLabel(state: SelectionState, itemNoun: string = "items"): string {
  if (state === "all") return `Deselect ${itemNoun}`;
  if (state === "some") return `Select remaining ${itemNoun}`;
  return `Select ${itemNoun}`;
}

// -- JOB 4 (AC7) - the search-scope asymmetry, stated rather than silent ----

/**
 * The "Select items" button's tooltip - also where JOB 4 / AC7's decision is
 * disclosed to the user, rather than left as a silent surprise.
 *
 * DECISION: kept RAW / unfiltered. Every one of the three call sites this
 * file consolidates already selected a container's FULL item list
 * regardless of any active search filter -
 * `useModuleSelection.toggleModuleItems` iterated `m.items` raw (`:498`,
 * documented deliberate at docs/REGRESSION.md:19939-19943); ModuleCard's
 * export branch and `RepoFoldersSection.toggleAllFilesInFolder` never
 * consulted a filter either, and repo folders have no search concept to
 * filter against in the first place (RepoFoldersSection.tsx never receives
 * `moduleSearch`). Filter-scoping two of the three sources while leaving the
 * third permanently unfilterable would trade one disclosed inconsistency
 * (search-scope) for a worse, undisclosable one (source-scope) - AC7
 * requires the behaviour to be STATED, not necessarily changed, and this is
 * the smaller, honest change. `toggleAll` (useModuleSelection.ts:451-453)
 * stays filter-scoped, unchanged - the two behaviours differ on purpose and
 * both have call sites.
 *
 * `hasSearchScope` is false for a repo folder (no search exists to hide
 * anything) and true for a live/export module (moduleSearch in
 * useModuleSelection.ts can hide items the button would still reach).
 */
export function selectItemsButtonTooltip(
  state: SelectionState,
  containerNoun: "module" | "folder",
  itemNoun: string,
  hasSearchScope: boolean
): string {
  const verb = state === "all" ? "Deselect" : "Select";
  const scopeNote = hasSearchScope ? ", including any currently hidden by the search filter" : "";
  return `${verb} every ${itemNoun} in this ${containerNoun}${scopeNote}`;
}
