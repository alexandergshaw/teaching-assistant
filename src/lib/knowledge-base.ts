// Per-institution knowledge base (Confluence/Notion-style page tree) for the
// policies, rules, and deadlines an instructor must track per school. See
// supabase/migrations/20260910000000_create_institution_pages.sql for the
// table this reads and writes.
//
// Institutions are a client-side concept (src/lib/institutions.ts keeps the
// acronym registry in localStorage - there is no institutions table), so
// every page is scoped by a plain uppercased-acronym string. normalizeInstitution
// is the single place that casing gets normalized, so a page saved through one
// code path is never invisible to another because of a casing mismatch.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export interface InstitutionPage {
  id: string;
  institution: string;
  parentId: string | null;
  title: string;
  body: string;
  tags: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface InstitutionPageNode extends InstitutionPage {
  children: InstitutionPageNode[];
}

export interface PageSearchHit {
  page: InstitutionPage;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (no I/O, no Date, no randomness) - unit-tested directly.
// ---------------------------------------------------------------------------

/** Trim + uppercase, matching what src/lib/institutions.ts stores. */
export function normalizeInstitution(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Resolve each page's EFFECTIVE parent id (null = root), defending against
 * two kinds of bad state a delete race or a bad move can produce:
 *
 *  - a parent_id pointing at a page that no longer exists: the page surfaces
 *    at the root instead of silently vanishing from the tree (a lost page is
 *    worse than a misplaced one).
 *  - a parent cycle (A -> B -> A): walking the chain would loop forever, so
 *    this stops the walk the moment it revisits a node already on the
 *    CURRENT walk's path and makes that node (the cycle's entry point) a
 *    root. Every other node on the cycle keeps its natural parent_id, which
 *    is still a valid pointer to a page that ends up somewhere in the tree -
 *    so no page is dropped, and no page's real parent link is disturbed
 *    except the single node needed to break the loop.
 *
 * Runs in O(n): each page is "finalized" (assigned an effective parent) at
 * most once across the whole pass, whichever page's walk reaches it first.
 */
function computeEffectiveParents(pages: InstitutionPage[]): Map<string, string | null> {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const resolved = new Map<string, string | null>();
  const finalized = new Set<string>();

  for (const start of pages) {
    if (finalized.has(start.id)) continue;

    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let currentId: string | null = start.id;

    while (currentId) {
      if (finalized.has(currentId)) {
        // Walked into a chain that was already resolved by an earlier pass -
        // nothing left to decide for the rest of this path.
        break;
      }
      if (pathIndex.has(currentId)) {
        // Revisiting a node already on THIS walk's path: that node is the
        // cycle's entry point. Break the cycle by rooting it there.
        resolved.set(currentId, null);
        finalized.add(currentId);
        break;
      }
      pathIndex.set(currentId, path.length);
      path.push(currentId);

      const page = byId.get(currentId);
      const parentId = page ? page.parentId : null;
      if (parentId == null || !byId.has(parentId)) {
        // No parent, or the parent is missing - this page is a root.
        resolved.set(currentId, null);
        finalized.add(currentId);
        break;
      }
      currentId = parentId;
    }

    // Every other node visited on this walk points at a page that IS in the
    // map and does resolve (to a root, or into the cycle-entry root above),
    // so its natural parent_id is safe to keep as-is.
    for (const id of path) {
      if (!finalized.has(id)) {
        resolved.set(id, byId.get(id)!.parentId);
        finalized.add(id);
      }
    }
  }

  return resolved;
}

/**
 * Nest pages into a tree. Siblings are ordered by position then title. See
 * computeEffectiveParents for how a missing parent or a parent cycle is
 * handled - both surface every page rather than dropping or hanging on it.
 */
export function buildPageTree(pages: InstitutionPage[]): InstitutionPageNode[] {
  const effectiveParent = computeEffectiveParents(pages);

  const byParent = new Map<string | null, InstitutionPage[]>();
  for (const page of pages) {
    const parentId = effectiveParent.get(page.id) ?? null;
    const list = byParent.get(parentId);
    if (list) list.push(page);
    else byParent.set(parentId, [page]);
  }

  const sortSiblings = (list: InstitutionPage[]): InstitutionPage[] =>
    [...list].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

  function build(parentId: string | null): InstitutionPageNode[] {
    return sortSiblings(byParent.get(parentId) ?? []).map((page) => ({
      ...page,
      children: build(page.id),
    }));
  }

  return build(null);
}

const SNIPPET_RADIUS = 60;

function buildSnippet(body: string, matchIndex: number, matchLength: number): string {
  if (matchIndex === -1) {
    // The hit came from the title or tags, not the body - give a short
    // lead-in from the body anyway so every hit has some context.
    const lead = body.trim().slice(0, SNIPPET_RADIUS * 2);
    return body.trim().length > lead.length ? `${lead}...` : lead;
  }
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(body.length, matchIndex + matchLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < body.length ? "..." : "";
  return `${prefix}${body.slice(start, end).trim()}${suffix}`;
}

/** Case-insensitive match over title, body and tags. */
export function searchPages(pages: InstitutionPage[], query: string): PageSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: PageSearchHit[] = [];
  for (const page of pages) {
    const bodyLower = page.body.toLowerCase();
    const bodyIdx = bodyLower.indexOf(q);
    const titleMatch = page.title.toLowerCase().includes(q);
    const tagMatch = page.tags.some((t) => t.toLowerCase().includes(q));

    if (titleMatch || tagMatch || bodyIdx !== -1) {
      hits.push({ page, snippet: buildSnippet(page.body, bodyIdx, q.length) });
    }
  }
  return hits;
}

/**
 * The ancestor chain for a page, root first, including the page itself last.
 * Cycle-safe: stops rather than looping when the chain revisits a node
 * (matches the same "don't hang" requirement as buildPageTree). Returns []
 * when the id is not found.
 */
export function pageBreadcrumb(pages: InstitutionPage[], id: string): InstitutionPage[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const chain: InstitutionPage[] = [];
  const seen = new Set<string>();

  let currentId: string | null = id;
  while (currentId) {
    if (seen.has(currentId)) break;
    const page = byId.get(currentId);
    if (!page) break;
    seen.add(currentId);
    chain.push(page);
    currentId = page.parentId;
  }

  return chain.reverse();
}

/** The position a new sibling should take: one past the current maximum. */
export function nextPosition(siblings: InstitutionPage[]): number {
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((s) => s.position)) + 1;
}

/**
 * True when moving `movingId` under `newParentId` would make the page its
 * own ancestor (directly, or by moving it under one of its own descendants).
 * This is the check moveInstitutionPage runs before writing - a cycle here
 * would break buildPageTree/pageBreadcrumb (and every future consumer) for
 * every reader, not just whoever made the bad move, so it cannot be a
 * UI-only convention.
 */
export function wouldCreateCycle(
  pages: InstitutionPage[],
  movingId: string,
  newParentId: string | null
): boolean {
  if (newParentId == null) return false;
  if (newParentId === movingId) return true;

  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  let currentId: string | null = newParentId;

  while (currentId) {
    if (currentId === movingId) return true;
    if (seen.has(currentId)) return false; // pre-existing cycle elsewhere - not this move's problem
    seen.add(currentId);
    const page = byId.get(currentId);
    if (!page) return false;
    currentId = page.parentId;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Data access layer.
// ---------------------------------------------------------------------------

// Exported so the row -> page mapping is unit-testable without a live
// Supabase client (mirrors mapRecordingFile in src/lib/recording-files.ts).
export function mapInstitutionPage(
  row: Database["public"]["Tables"]["institution_pages"]["Row"]
): InstitutionPage {
  return {
    id: row.id,
    institution: row.institution,
    parentId: row.parent_id,
    title: row.title,
    body: row.body,
    tags: row.tags,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listInstitutionPages(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string
): Promise<InstitutionPage[]> {
  const { data: rows, error } = await supabase
    .from("institution_pages")
    .select("*")
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution))
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return (rows || []).map(mapInstitutionPage);
}

/** Fetch one page by id, scoped to its owner; null if missing or not owned. */
export async function getInstitutionPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<InstitutionPage | null> {
  const { data: row, error } = await supabase
    .from("institution_pages")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;
  return mapInstitutionPage(row);
}

export interface CreateInstitutionPageInput {
  institution: string;
  parentId?: string | null;
  title?: string;
  body?: string;
  tags?: string[];
  position?: number;
}

export async function createInstitutionPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateInstitutionPageInput
): Promise<InstitutionPage> {
  const institution = normalizeInstitution(input.institution);
  const parentId = input.parentId ?? null;

  let position = input.position;
  if (position == null) {
    const siblings = (await listInstitutionPages(supabase, userId, institution)).filter(
      (p) => p.parentId === parentId
    );
    position = nextPosition(siblings);
  }

  const now = new Date().toISOString();
  const insertRow: Database["public"]["Tables"]["institution_pages"]["Insert"] = {
    id: crypto.randomUUID(),
    user_id: userId,
    institution,
    parent_id: parentId,
    title: input.title ?? "",
    body: input.body ?? "",
    tags: input.tags ?? [],
    position,
    created_at: now,
    updated_at: now,
  };

  const { data: row, error } = await supabase
    .from("institution_pages")
    .insert(insertRow)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapInstitutionPage(row);
}

export interface UpdateInstitutionPageInput {
  title?: string;
  body?: string;
  tags?: string[];
}

/** Update a page's title/body/tags. updated_at is always bumped. */
export async function updateInstitutionPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  updates: UpdateInstitutionPageInput
): Promise<InstitutionPage> {
  const updateRow: Database["public"]["Tables"]["institution_pages"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (updates.title !== undefined) updateRow.title = updates.title;
  if (updates.body !== undefined) updateRow.body = updates.body;
  if (updates.tags !== undefined) updateRow.tags = updates.tags;

  const { data: row, error } = await supabase
    .from("institution_pages")
    .update(updateRow)
    .eq("user_id", userId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapInstitutionPage(row);
}

export interface MoveInstitutionPageInput {
  /** undefined = leave the current parent unchanged; null = move to root. */
  parentId?: string | null;
  /** undefined = leave the current position unchanged. */
  position?: number;
}

/**
 * Re-parent and/or reposition a page. When the parent is changing, this
 * fetches every page in the same institution and runs wouldCreateCycle
 * server-side before writing anything - see that function's docstring for
 * why this cannot be left to the UI alone. updated_at is always bumped.
 */
export async function moveInstitutionPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  target: MoveInstitutionPageInput
): Promise<InstitutionPage> {
  const current = await getInstitutionPage(supabase, userId, id);
  if (!current) throw new Error("Page not found.");

  const nextParentId = target.parentId !== undefined ? target.parentId : current.parentId;

  if (nextParentId !== current.parentId) {
    const institutionPages = await listInstitutionPages(supabase, userId, current.institution);
    if (nextParentId != null && !institutionPages.some((p) => p.id === nextParentId)) {
      throw new Error("The target parent page was not found.");
    }
    if (wouldCreateCycle(institutionPages, id, nextParentId)) {
      throw new Error("Cannot move a page under itself or one of its own subpages.");
    }
  }

  const updateRow: Database["public"]["Tables"]["institution_pages"]["Update"] = {
    parent_id: nextParentId,
    updated_at: new Date().toISOString(),
  };
  if (target.position !== undefined) updateRow.position = target.position;

  const { data: row, error } = await supabase
    .from("institution_pages")
    .update(updateRow)
    .eq("user_id", userId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapInstitutionPage(row);
}

/**
 * Delete a page. The migration's parent_id -> on delete cascade means this
 * also deletes the page's whole subtree at the database level - callers must
 * warn before calling this for exactly that reason.
 */
export async function deleteInstitutionPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase.from("institution_pages").delete().eq("user_id", userId).eq("id", id);

  if (error) throw new Error(error.message);
}
