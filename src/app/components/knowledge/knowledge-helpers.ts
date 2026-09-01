// Pure UI-logic helpers for the Knowledge tab (src/app/components/KnowledgeTab.tsx),
// plus the localStorage read/write wrappers around them. Split out from the
// component so the non-trivial bits - the delete warning's descendant count,
// the parent picker's excluded-id set, the move up/down arithmetic, and the
// persisted-state parsing - are unit-testable without rendering React (see
// knowledge-helpers.test.ts). Mirrors the split in src/lib/institutions.ts
// (pure-ish reads next to the reactive hook) and src/app/components/files/helpers.ts
// (pure helpers pulled out of a big tab component).

import { useCallback, useEffect, useState } from "react";
import { wouldCreateCycle, type InstitutionPage, type InstitutionPageNode } from "@/lib/knowledge-base";
import { useInstitutions, readActiveInstitution } from "@/lib/institutions";

// ---------------------------------------------------------------------------
// Tree lookups (delete warning, parent picker).
// ---------------------------------------------------------------------------

/** Find a node anywhere in the tree by id, or null if it is not present. */
export function findNode(tree: InstitutionPageNode[], id: string): InstitutionPageNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * How many pages sit below `id` in the tree (not counting the page itself).
 * This is the number the delete confirmation must state - the migration's
 * parent_id -> on delete cascade means every one of them is deleted along
 * with the page, so "are you sure" alone would hide the real blast radius.
 */
export function countDescendants(tree: InstitutionPageNode[], id: string): number {
  const node = findNode(tree, id);
  if (!node) return 0;
  let count = 0;
  const walk = (n: InstitutionPageNode) => {
    for (const child of n.children) {
      count += 1;
      walk(child);
    }
  };
  walk(node);
  return count;
}

/**
 * The set of page ids the parent picker must not offer when re-parenting
 * `movingId`: the page itself, plus every one of its descendants (moving a
 * page under its own descendant would make it its own ancestor). Built by
 * running the server's own wouldCreateCycle check against every candidate,
 * so the UI can never offer a choice the server would refuse - see
 * src/lib/knowledge-base.ts's wouldCreateCycle docstring.
 */
export function invalidParentIds(pages: InstitutionPage[], movingId: string): Set<string> {
  const invalid = new Set<string>();
  for (const page of pages) {
    if (wouldCreateCycle(pages, movingId, page.id)) invalid.add(page.id);
  }
  return invalid;
}

/**
 * Flatten the tree into the ids currently rendered on screen (S3's "select
 * all over the currently VISIBLE pages") - every root node, plus a node's
 * children only when that node is itself expanded. This mirrors exactly
 * what PageTreeView.tsx renders (its `hasChildren && isOpen` gate on
 * recursion) - a collapsed branch's children are not shown, so a select-all
 * must not silently reach into them. (This tab's search box does not filter
 * the tree itself - see its `searchHits` panel in KnowledgeTab.tsx - so
 * expand/collapse state is the one thing here that actually changes what's
 * on screen, playing the same role useModuleSelection.ts's `visibleModules`
 * search filter plays for that tree.)
 */
export function visiblePageIds(nodes: InstitutionPageNode[], expanded: Set<string>): string[] {
  const ids: string[] = [];
  const walk = (list: InstitutionPageNode[]) => {
    for (const node of list) {
      ids.push(node.id);
      if (node.children.length > 0 && expanded.has(node.id)) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

/**
 * Whether every currently-visible page is already selected - the "Select
 * all" affordance's checked state (S3). False for an empty `visibleIds`
 * (nothing to select, so the control reads as off rather than vacuously
 * "checked"). This repo uses no indeterminate checkbox state anywhere, so a
 * partial selection also simply reads as unchecked - matching `allSelected`
 * in useModuleSelection.ts.
 */
export function allVisibleSelected(selected: Set<string>, visibleIds: string[]): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}

/**
 * Describe the bulk selection by page TITLE (B5) - deliberately filters the
 * full, flat `pages` list (every page the institution has, regardless of
 * tree expand/collapse state), NOT `visiblePageIds`'s walk-only-expanded-
 * nodes result above. A page selected inside a collapsed branch has no
 * checkbox on screen and is otherwise invisible; this is the one place that
 * must still be able to name it, since it is still shipped to the model as
 * grading/drafting context (KnowledgeTab.tsx's askAiAboutSelection /
 * startRecordingWithSelection / startGradingWithSelection).
 *
 * `text` is never empty for a non-empty selection and never silently drops
 * a page - anything past `maxShown` is folded into a stated "+N more"
 * count rather than just being cut off.
 */
export interface SelectedPagesDescription {
  /** Up to `maxShown` selected page titles, in `pages` order. */
  shownTitles: string[];
  /** How many selected pages exist beyond `shownTitles` - 0 when every
   *  selected page fit. */
  overflowCount: number;
  /** Human-readable one-line summary, e.g. "Grading rubric, Late policy
   *  +3 more", or "" for an empty selection. */
  text: string;
}

export function describeSelectedPages(
  pages: InstitutionPage[],
  selected: Set<string>,
  maxShown = 3
): SelectedPagesDescription {
  const titles = pages
    .filter((p) => selected.has(p.id))
    .map((p) => p.title.trim() || "Untitled page");
  const shownTitles = titles.slice(0, maxShown);
  const overflowCount = titles.length - shownTitles.length;
  const text =
    shownTitles.length === 0
      ? ""
      : overflowCount > 0
      ? `${shownTitles.join(", ")} +${overflowCount} more`
      : shownTitles.join(", ");
  return { shownTitles, overflowCount, text };
}

// ---------------------------------------------------------------------------
// Move up / down arithmetic (AC7's "keep it simple" reordering).
// ---------------------------------------------------------------------------

export interface PositionedItem {
  id: string;
  position: number;
}

/**
 * Compute the position swap for moving `id` one slot up or down within an
 * already-ordered `siblings` list (e.g. a tree node's `children`, or the
 * tree's root list). Returns the two {id, position} pairs to write (moved
 * item takes its neighbor's position and vice versa), or null when the move
 * is not possible: `id` is not in the list, or it is already at the end the
 * move points toward.
 */
export function computeReorder(
  siblings: PositionedItem[],
  id: string,
  direction: "up" | "down"
): [PositionedItem, PositionedItem] | null {
  const idx = siblings.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= siblings.length) return null;

  const current = siblings[idx];
  const neighbor = siblings[targetIdx];
  return [
    { id: current.id, position: neighbor.position },
    { id: neighbor.id, position: current.position },
  ];
}

// ---------------------------------------------------------------------------
// Persisted UI state - selected page id and expanded tree nodes, both keyed
// per institution so switching schools doesn't clobber the other's state.
// ---------------------------------------------------------------------------

const SELECTED_PAGE_KEY = "ta-kb-selected-page";
const EXPANDED_KEY = "ta-kb-expanded";

function parseInstitutionMap(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The fallback rule shared by every source of a candidate selected-page id -
 * localStorage (below) and the URL's kbPage param (see KnowledgeTab.tsx's
 * reconciliation effect) - AC4: an id that no longer exists, or belongs to a
 * different institution's page list, must never leave a dangling selection.
 * Institution-scoping is the caller's job: pass the validIds set for
 * whichever institution is actually in effect.
 */
export function pickValidPageId(id: string | null, validIds: Set<string>): string | null {
  return id !== null && validIds.has(id) ? id : null;
}

/**
 * Parse the stored selected-page id for one institution out of the raw
 * localStorage value. A missing key, corrupt JSON, or an id that is no
 * longer in `validIds` (the page was deleted, or moved to another
 * institution) all fall back to null - never a dangling selection.
 */
export function parseSelectedPageId(
  raw: string | null,
  institution: string,
  validIds: Set<string>
): string | null {
  const map = parseInstitutionMap(raw);
  if (!map) return null;
  const id = map[institution];
  return pickValidPageId(typeof id === "string" ? id : null, validIds);
}

/** Parse the stored expanded-node id set for one institution. Corrupt or
 *  missing data falls back to an empty set (fully collapsed), never a crash. */
export function parseExpandedIds(raw: string | null, institution: string): Set<string> {
  const map = parseInstitutionMap(raw);
  if (!map) return new Set();
  const list = map[institution];
  if (!Array.isArray(list)) return new Set();
  return new Set(list.filter((x): x is string => typeof x === "string"));
}

export function readSelectedPageId(institution: string, validIds: Set<string>): string | null {
  if (typeof window === "undefined") return null;
  return parseSelectedPageId(localStorage.getItem(SELECTED_PAGE_KEY), institution, validIds);
}

/** Persist the selected page id for one institution; pass null to clear it. */
export function writeSelectedPageId(institution: string, id: string | null): void {
  if (typeof window === "undefined") return;
  const map = parseInstitutionMap(localStorage.getItem(SELECTED_PAGE_KEY)) ?? {};
  if (id) map[institution] = id;
  else delete map[institution];
  localStorage.setItem(SELECTED_PAGE_KEY, JSON.stringify(map));
}

export function readExpandedIds(institution: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  return parseExpandedIds(localStorage.getItem(EXPANDED_KEY), institution);
}

export function writeExpandedIds(institution: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const map = parseInstitutionMap(localStorage.getItem(EXPANDED_KEY)) ?? {};
  map[institution] = Array.from(ids);
  localStorage.setItem(EXPANDED_KEY, JSON.stringify(map));
}

// ---------------------------------------------------------------------------
// Bulk selection (checkboxes) - the tree's per-row checkbox state feeding
// the bulk action bar and "Ask AI" (S1-S6, A1). Persisted per institution
// exactly like `expanded` above: a Record<institution, string[]> map read
// through the same parseInstitutionMap, and serialized the same way
// (Array.from(set)) - deliberately its OWN key, independent of
// SELECTED_PAGE_KEY above, since that one is the single "page currently
// open in the editor" id, not this multi-select set. See useKbSelection.ts
// for the Set-algebra (toggle/merge-unmerge-visible/prune) built on top of
// these read/write wrappers.
// ---------------------------------------------------------------------------

const BULK_SELECTED_KEY = "ta-kb-bulk-selected";

/** Parse the stored bulk-selected page id set for one institution. Corrupt
 *  or missing data falls back to an empty set, never a crash - same
 *  contract as parseExpandedIds above. */
export function parseBulkSelectedIds(raw: string | null, institution: string): Set<string> {
  const map = parseInstitutionMap(raw);
  if (!map) return new Set();
  const list = map[institution];
  if (!Array.isArray(list)) return new Set();
  return new Set(list.filter((x): x is string => typeof x === "string"));
}

export function readBulkSelectedIds(institution: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  return parseBulkSelectedIds(localStorage.getItem(BULK_SELECTED_KEY), institution);
}

export function writeBulkSelectedIds(institution: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const map = parseInstitutionMap(localStorage.getItem(BULK_SELECTED_KEY)) ?? {};
  map[institution] = Array.from(ids);
  localStorage.setItem(BULK_SELECTED_KEY, JSON.stringify(map));
}

// ---------------------------------------------------------------------------
// Attachments panel open/closed (AC3 of the attach/embed feature) - a flat
// boolean, not scoped per institution or page, matching the
// ta-workflows-steps-open / ta-workflows-run-history-open convention in
// WorkflowsTab.tsx (a single collapse preference the instructor sets once
// and expects everywhere) rather than the per-institution map shape above.
// ---------------------------------------------------------------------------

const ATTACHMENTS_PANEL_OPEN_KEY = "ta-kb-attachments-open";

/** Defaults to open (true) - an instructor's first visit should show the
 * attachments panel, not hide a feature they have not discovered yet. */
export function readAttachmentsPanelOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(ATTACHMENTS_PANEL_OPEN_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export function writeAttachmentsPanelOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ATTACHMENTS_PANEL_OPEN_KEY, open ? "true" : "false");
  } catch {
    // ignore storage write failures
  }
}

// ---------------------------------------------------------------------------
// Institution selection - the Knowledge tab owns its own choice of
// institution, stored under its own ta-kb- key rather than the shared
// ta-active-institution one from src/lib/institutions.ts that the header's
// InstitutionSwitcher and the Live Feed/Communications tabs use. The header's
// active institution is consulted only as a ONE-TIME SEED the first time
// this tab is used (nothing stored yet) - once a value is stored here, the
// two selections are fully independent. A later change to the header must
// never change this tab's choice, and a later change here must never touch
// the header. "It followed the header once" is the seed working as
// designed, not a bug to fix.
// ---------------------------------------------------------------------------

const KB_INSTITUTION_KEY = "ta-kb-institution";

// Shared between KnowledgeTab.tsx's in-tab confirmDiscard() and page.tsx's
// popstate handler (AC5) so the two prompts can never drift into two
// different-sounding messages for what is, from the instructor's point of
// view, the exact same "you're about to lose this edit" moment.
export const KB_DISCARD_MESSAGE = "You have unsaved changes to this page. Discard them and continue?";

/**
 * Pure resolution of which institution the Knowledge tab should show, given:
 *  - `stored`: whatever is currently under this tab's own key (null if
 *    nothing has ever been stored),
 *  - `registered`: the current registered acronym list,
 *  - `headerActive`: the header's current active institution, consulted only
 *    when `stored` is null (see the seeding note above).
 *
 * Precedence: a still-registered stored value always wins; otherwise a
 * registered header value is used as a one-time seed; otherwise the first
 * registered institution; otherwise "" when none are registered at all.
 * Exported and unit-tested directly (see knowledge-helpers.test.ts) so every
 * combination - including a stored value that fell out of the registry - is
 * covered without rendering the component.
 */
export function resolveActiveKbInstitution(
  stored: string | null,
  registered: string[],
  headerActive: string
): string {
  if (registered.length === 0) return "";
  if (stored && registered.includes(stored)) return stored;
  if (!stored && headerActive && registered.includes(headerActive)) return headerActive;
  return registered[0];
}

/** The Knowledge tab's own stored institution, or null if nothing is stored yet. */
export function readKbInstitution(): string | null {
  if (typeof window === "undefined") return null;
  const raw = (localStorage.getItem(KB_INSTITUTION_KEY) ?? "").trim().toUpperCase();
  return raw || null;
}

/** Persist the Knowledge tab's own institution selection. */
export function writeKbInstitution(code: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KB_INSTITUTION_KEY, code.trim().toUpperCase());
}

// ---------------------------------------------------------------------------
// Edit session (KnowledgeTab.tsx's useKbEditSession hook) - the unsaved-edit
// check and the tag-list parsing on save, both pure enough to unit-test
// without rendering the edit form. Pulled out during the KnowledgeTab.tsx
// split since neither was previously reachable without rendering the
// component.
// ---------------------------------------------------------------------------

/**
 * Whether the current draft differs from the snapshot taken when editing
 * began - the single source of truth for the "unsaved changes" guard (the
 * beforeunload warning, the discard-confirmation prompts, and page.tsx's
 * popstate guard via onDirtyChange). False whenever there is no edit session
 * open at all (isEditing false, or no snapshot taken yet).
 */
export function isDraftDirty(
  isEditing: boolean,
  editSnapshot: { title: string; body: string; tags: string } | null,
  draftTitle: string,
  draftBody: string,
  draftTags: string
): boolean {
  return (
    isEditing &&
    !!editSnapshot &&
    (draftTitle !== editSnapshot.title || draftBody !== editSnapshot.body || draftTags !== editSnapshot.tags)
  );
}

/**
 * Turn the comma-separated tags textbox into the deduplicated tag list the
 * updateInstitutionPageAction server action expects: trim each entry, drop
 * blanks, drop duplicates.
 */
export function parseTagsInput(raw: string): string[] {
  return Array.from(new Set(raw.split(",").map((t) => t.trim()).filter(Boolean)));
}

/**
 * The Knowledge tab's own institution selection - deliberately separate from
 * src/lib/institutions.ts's useInstitutionSelection, which the header and the
 * Live Feed/Communications tabs share. See the module comment above for the
 * one-time seeding rule.
 *
 * `urlInstitution` (optional) is page.tsx's Back/Forward integration (AC1-3):
 * the institution named in the URL on this load, or null/undefined when the
 * URL named none. It is read only inside the useState initializer below, so
 * - exactly like every other view's URL-vs-localStorage initializer in
 * page.tsx - it wins ONLY on the very first render; it is not re-applied on
 * every render, and a later change to the argument (there is none - callers
 * pass a value computed once from window.location.search at mount) would be
 * ignored by React regardless. A URL institution that turns out to not be
 * registered falls through the same `resolveActiveKbInstitution` fallback as
 * any other stale stored value below - no separate check needed.
 */
export function useKbInstitutionSelection(urlInstitution?: string | null): {
  institutions: string[];
  active: string;
  setActive: (code: string) => void;
} {
  const institutions = useInstitutions();
  const [stored, setStored] = useState<string | null>(() => urlInstitution ?? readKbInstitution());

  // One-time seed: adjust state during render rather than in an effect (see
  // AGENTS.md's setState-in-effect idiom and KnowledgeTab's identical
  // prevActive pattern), so this only ever fires once - the moment a
  // registered institution first becomes available with nothing stored yet.
  if (stored === null && institutions.length > 0) {
    setStored(resolveActiveKbInstitution(null, institutions, readActiveInstitution()));
  }

  // Persist the tab's own selection whenever it changes. This is a plain
  // side effect (localStorage only, no setState), so it is unaffected by the
  // idiom above.
  useEffect(() => {
    if (stored) writeKbInstitution(stored);
  }, [stored]);

  const active = resolveActiveKbInstitution(stored, institutions, readActiveInstitution());
  // Memoized because callers put it in dependency arrays: as a fresh arrow
  // per render it silently re-ran their effects on every render. It only
  // forwards to setStored, which useState guarantees is stable, so an empty
  // dep list is correct.
  const setActive = useCallback((code: string) => setStored(code), []);

  return { institutions, active, setActive };
}
