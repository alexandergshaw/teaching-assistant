// Pure UI-logic helpers for the Knowledge tab (src/app/components/KnowledgeTab.tsx),
// plus the localStorage read/write wrappers around them. Split out from the
// component so the non-trivial bits - the delete warning's descendant count,
// the parent picker's excluded-id set, the move up/down arithmetic, and the
// persisted-state parsing - are unit-testable without rendering React (see
// knowledge-helpers.test.ts). Mirrors the split in src/lib/institutions.ts
// (pure-ish reads next to the reactive hook) and src/app/components/files/helpers.ts
// (pure helpers pulled out of a big tab component).

import { useEffect, useState } from "react";
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
  if (typeof id !== "string" || !validIds.has(id)) return null;
  return id;
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

/**
 * The Knowledge tab's own institution selection - deliberately separate from
 * src/lib/institutions.ts's useInstitutionSelection, which the header and the
 * Live Feed/Communications tabs share. See the module comment above for the
 * one-time seeding rule.
 */
export function useKbInstitutionSelection(): {
  institutions: string[];
  active: string;
  setActive: (code: string) => void;
} {
  const institutions = useInstitutions();
  const [stored, setStored] = useState<string | null>(() => readKbInstitution());

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
  const setActive = (code: string) => setStored(code);

  return { institutions, active, setActive };
}
