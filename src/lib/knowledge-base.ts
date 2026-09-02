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

/**
 * The fields a page picker needs to render a title tree, and nothing else -
 * deliberately NOT a subset of InstitutionPage's fields chosen for
 * convenience, but exactly what buildPageTree above (and pageBreadcrumb's
 * chain-walk, and the sibling-sort in buildPageTree's sortSiblings) actually
 * read: id and parentId to nest, position and title to order siblings, title
 * again to render. No `body` - that is the entire point of this type existing
 * alongside InstitutionPage (see listInstitutionPageSummaries below).
 */
export interface InstitutionPageSummary {
  id: string;
  parentId: string | null;
  title: string;
  position: number;
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

export interface RenderInstitutionPolicyTextResult {
  /** Tree-ordered "Title\nBody" blocks, joined by a blank line, with a
   * trailing note when pages were dropped to stay within budget. Empty
   * string when there are no pages (or none fit within even a tiny budget). */
  text: string;
  /** How many pages made it into `text`. */
  includedCount: number;
  /** How many pages were dropped because the budget ran out. 0 means every
   * page fit. */
  omittedCount: number;
}

/**
 * Render an institution's whole page tree into one prompt-ready block, for
 * live-class.ts's buildLiveSessionContextAction (the institution's policies
 * and rules, alongside the course's own facts). Pure and exported so the
 * budget/truncation behavior is unit-testable without Supabase.
 *
 * Pages are walked in buildPageTree order (root-first, depth-first, siblings
 * by position/title) - the SAME order an instructor sees in the knowledge-base
 * UI - so a policy page's meaning is never divorced from its heading and
 * related pages stay adjacent.
 *
 * `budget` is an explicit character cap (the caller decides the number - see
 * POLICY_TEXT_CHAR_BUDGET in live-class.ts). Truncation always lands on a
 * PAGE boundary: a page that would not fit in full is left out entirely
 * rather than cut mid-sentence, because a half-sentence policy is worse than
 * a missing one. When any page is left out, a trailing note states exactly
 * how many were omitted, so a thin policy section is diagnosable rather than
 * silently read as the whole knowledge base.
 */
export function renderInstitutionPolicyText(
  pages: InstitutionPage[],
  budget: number
): RenderInstitutionPolicyTextResult {
  const ordered: InstitutionPage[] = [];
  function collect(nodes: InstitutionPageNode[]): void {
    for (const node of nodes) {
      ordered.push(node);
      collect(node.children);
    }
  }
  collect(buildPageTree(pages));

  const blocks: string[] = [];
  let used = 0;
  let includedCount = 0;

  for (const page of ordered) {
    const title = page.title.trim() || "Untitled page";
    const body = page.body.trim();
    const block = body ? `${title}\n${body}` : title;
    // +2 for the "\n\n" separator this block would need once joined - paid
    // by every block except the very first.
    const cost = block.length + (blocks.length > 0 ? 2 : 0);
    if (used + cost > budget) break; // page boundary, never mid-sentence
    blocks.push(block);
    used += cost;
    includedCount += 1;
  }

  const omittedCount = ordered.length - includedCount;
  let text = blocks.join("\n\n");
  if (omittedCount > 0) {
    const note = `[${omittedCount} more policy page${omittedCount === 1 ? "" : "s"} omitted to stay within the context budget]`;
    text = text ? `${text}\n\n${note}` : note;
  }

  return { text, includedCount, omittedCount };
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

/**
 * Every page id in `rootId`'s subtree: `rootId` itself plus all of its
 * descendants, walked via the RAW `parentId` relationship - NOT
 * computeEffectiveParents' display-oriented reinterpretation (which reroots
 * an orphaned or cyclic page for the tree UI's benefit). This function
 * exists to answer a different question: what is the database's
 * `institution_pages.parent_id ... on delete cascade` about to remove when
 * `rootId` is deleted? That cascade follows the real foreign key, so this
 * must too - see src/lib/institution-page-attachments.ts's
 * deleteInstitutionPageAndAttachments, which uses the result to find every
 * attachment whose Storage object must be cleaned up before the delete
 * runs.
 *
 * Cycle-safe (a cycle should never exist among real parent_id values -
 * wouldCreateCycle rejects the move that would create one - but this still
 * cannot hang on bad data: each id is only ever pushed onto the walk once).
 */
export function collectSubtreePageIds(pages: InstitutionPage[], rootId: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const page of pages) {
    if (page.parentId == null) continue;
    const siblings = childrenByParent.get(page.parentId);
    if (siblings) siblings.push(page.id);
    else childrenByParent.set(page.parentId, [page.id]);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    for (const childId of childrenByParent.get(id) ?? []) stack.push(childId);
  }
  return ids;
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

// Row shape for listInstitutionPageSummaries' narrowed select - derived from
// the real generated Row type (via Pick) rather than hand-typed, so a schema
// change to any of these four columns still shows up here as a type error.
type InstitutionPageSummaryRow = Pick<
  Database["public"]["Tables"]["institution_pages"]["Row"],
  "id" | "parent_id" | "title" | "position"
>;

// Exported so the row -> summary mapping is unit-testable without a live
// Supabase client, same reason mapInstitutionPage is exported above.
export function mapInstitutionPageSummary(row: InstitutionPageSummaryRow): InstitutionPageSummary {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    position: row.position,
  };
}

/**
 * List every page recorded for one institution, WITHOUT bodies - powers a
 * page picker that only needs to render a title tree (a Recording-tab
 * knowledge picker adds pages to a run's context; see this file's module
 * comment for the audit that found listInstitutionPages' full-row
 * `select("*")` was the only page-listing path, which would mean pulling
 * every page's body just to populate a picker). listInstitutionPages above
 * is unchanged and still owns the Knowledge tab's own full-row read - this
 * is a narrower query alongside it, not a replacement.
 *
 * The Supabase client's generated relation types resolve a column-narrowed
 * `.select()` to `never` on this table (the same problem src/lib/google-credentials.ts's
 * `table()` comment documents) - worked around here with a targeted `any`
 * cast at the `.from()` call, with the real row shape restored immediately
 * through mapInstitutionPageSummary's parameter type (InstitutionPageSummaryRow,
 * itself derived from the generated Row type) rather than trusting inference.
 */
export async function listInstitutionPageSummaries(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string
): Promise<InstitutionPageSummary[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from("institution_pages")
    .select("id, parent_id, title, position")
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution))
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return ((rows || []) as InstitutionPageSummaryRow[]).map(mapInstitutionPageSummary);
}

/**
 * Count how many pages are filed under an institution, without fetching the
 * rows themselves - used by the institution-removal confirmation (AC1 of the
 * "delete institutions" feature) to state the real blast radius before an
 * acronym is hidden. See src/lib/institution-removal.ts.
 */
export async function countInstitutionPages(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string
): Promise<number> {
  const { count, error } = await supabase
    .from("institution_pages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution));

  if (error) throw new Error(error.message);
  return count ?? 0;
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

/**
 * Every page whose id is in `ids`, owner-scoped, WITH bodies - the on-demand
 * counterpart to listInstitutionPageSummaries: a picker lists titles cheaply
 * via that function, then calls this only for the page(s) an instructor
 * actually adds to a run's context.
 *
 * Takes a batch rather than a single id, even though the picker adds pages
 * one at a time, because a multi-select "add" can name several pages in one
 * user action - a batch call lets that case fetch every body in one round
 * trip instead of the caller looping N calls. The single-add case is simply
 * a one-element array, so one function serves both without a second,
 * near-duplicate function to keep in sync.
 *
 * Mirrors listInstitutionPageAttachmentsForPages's empty-input guard (see
 * src/lib/institution-page-attachments.ts): an empty `.in()` filter is either
 * a PostgREST error or a vacuous no-match depending on client version, so
 * this short-circuits to [] without a query rather than relying on that.
 *
 * A missing or foreign id is simply absent from the result rather than an
 * error - the same "vanish rather than throw" contract that batch read uses -
 * so a caller passing an id for a page deleted between the picker's load and
 * the add gets back a partial-but-valid result instead of a rejected promise.
 */
export async function getInstitutionPagesByIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  ids: string[]
): Promise<InstitutionPage[]> {
  if (ids.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("institution_pages")
    .select("*")
    .eq("user_id", userId)
    .in("id", ids);

  if (error) throw new Error(error.message);
  return (rows || []).map(mapInstitutionPage);
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
