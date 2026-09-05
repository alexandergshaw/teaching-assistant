// Pure scope-resolution helpers for the knowledge overview feature (an
// AI-generated summary + an Ask AI textbox on a "parent" knowledge page -
// see the feature's AC.md, AC1/AC2). Nothing here touches Supabase, the LLM,
// or React state: every export is a plain function over an already-loaded
// InstitutionPage[], so it is unit-testable without a live client and safely
// importable from both a "use server" action (the server pipeline) and a
// client component (the panel).
//
// See CORRECTIONS.md X10 for why every scope-membership question in this
// file is answered via buildPageTree rather than collectSubtreePageIds, even
// though collectSubtreePageIds already exists in knowledge-base.ts for a
// very similar-sounding purpose. collectSubtreePageIds walks the RAW
// parentId foreign key (it exists to mirror the database's ON DELETE
// CASCADE, not what an instructor sees) via a stack.pop() DFS with NO
// sibling sort at all. buildPageTree sorts siblings by position then title
// before nesting them, and that sort is what the Knowledge tab's tree view
// actually renders. Any page with two or more children can diverge between
// the two walks - this needs no corrupted data or parent cycle, it happens
// on completely ordinary data, every time a page has more than one child in
// an order other than insertion order. Using collectSubtreePageIds here
// would let this feature's "which pages are in scope" and "in what order do
// citations render" silently disagree with what the instructor sees
// highlighted in the tree.

import {
  buildPageTree,
  normalizeInstitution,
  type InstitutionPage,
  type InstitutionPageNode,
} from "./knowledge-base";

/**
 * The two entry points this feature is built for (see AC.md's "Scope
 * decision"): the institution root (every page across the whole
 * institution) and a specific page's subtree (that page plus all of its
 * descendants). Exported as a shared vocabulary type so the server action
 * and UI layers can pass one value around instead of a bare
 * `string | null`, which reads as "some id, maybe" at every call site with
 * no name for what null means.
 */
export type KnowledgeScope = { kind: "institution" } | { kind: "subtree"; pageId: string };

/**
 * gemini-3.1-flash-lite's 1,048,576-token input window already justifies a
 * 400,000-character cap as safe for a single request - see the
 * DEFAULT_MAX_CHARS_PER_SUBMISSION comment at src/lib/gemini.ts:27-59, which
 * works the same "stay comfortably under 10% of the window" arithmetic for a
 * different feature's context budget. This feature's scope is chosen by TREE
 * POSITION rather than by an instructor hand-ticking checkboxes, so an
 * institution-root scope can pull in every policy page in one shot; 120,000
 * characters (~30,000 tokens at ~4 chars/token) stays well under that
 * 400,000-character ceiling while still being large enough that the common
 * case this feature targets - a few dozen short policy pages - fits without
 * truncation at all.
 *
 * Declared ONCE, here (see CORRECTIONS.md X13 - an earlier draft of the
 * build spec put this constant at 24000 and named a second module as its
 * owner; both are superseded). The server-side context pipeline
 * (src/lib/knowledge-scope-context.ts) imports this constant rather than
 * restating the number, so the budget can never drift between the two
 * layers that need to agree on it.
 */
export const KNOWLEDGE_OVERVIEW_CONTEXT_MAX_CHARS = 120000;

/**
 * The token stood in for "no page selected" (the institution-root scope) in
 * a scope's storage key. Chosen over letting `scopePageId` fall through a
 * bare template literal - which would stringify `null` to the literal
 * three-character text "null" - not because "null" would actually collide
 * with a real page id today (institution_pages.id always comes from
 * gen_random_uuid() / crypto.randomUUID(), and neither can ever emit "null"
 * or "__root__"), but because relying on that stringification accident
 * documents nothing: a reader has to already know JavaScript's coercion
 * rules to see why the root scope's key looks the way it does. Writing the
 * sentinel out says so directly, and happens to be safe from collision for
 * the same reason a real id could never equal "null" either.
 */
const ROOT_SCOPE_SENTINEL = "__root__";

/**
 * The key AC8's persisted UI control state (the ta-kb-overview-open,
 * ta-kb-overview-history-open and ta-kb-overview-question localStorage
 * records) is keyed by - one entry per (institution, scope). Institution is
 * normalized so a root-scope key is stable across a casing difference the
 * same way every database read/write in this feature is (see
 * knowledge-overview.ts) - without this, a page saved while "mcc" was typed
 * would persist its open/closed state under a different key than the same
 * institution typed "MCC" a moment later. The root sentinel and a real page
 * id can never collide because a real id is always a UUID and a UUID is
 * never the literal string "__root__".
 */
export function scopeStorageKey(institution: string, scopePageId: string | null): string {
  return `${normalizeInstitution(institution)}:${scopePageId ?? ROOT_SCOPE_SENTINEL}`;
}

/** Depth-first search for a node by id inside an already-nested tree.
 *  Returns null rather than throwing when the id is not present - a scope
 *  page can legitimately have been deleted out from under an already-open
 *  scope, and every caller below treats "not found" as "empty scope"
 *  instead of an error. */
function findNode(nodes: InstitutionPageNode[], id: string): InstitutionPageNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Pre-order (node before its children) flatten of an already-nested subtree,
 * preserving buildPageTree's sibling order at every level - the same order
 * renderInstitutionPolicyText and pageBreadcrumb already rely on elsewhere
 * in this codebase for "the order a human reading the tree would see", and
 * the order AC2 requires for both the summary's "drew from" list and the Ask
 * AI answer's citation order.
 */
function flatten(nodes: InstitutionPageNode[], out: InstitutionPage[]): void {
  for (const node of nodes) {
    const { children, ...page } = node;
    out.push(page);
    flatten(children, out);
  }
}

/**
 * The pages a scope covers, in buildPageTree's DFS order (root-first,
 * siblings ordered by position then title) - see this file's header for why
 * that must be buildPageTree's order and not collectSubtreePageIds'.
 *
 * `scopePageId === null` is the institution-root scope (AC1a): every page in
 * the institution, the whole forest flattened into one list. A non-null id
 * is the subtree scope (AC1b): that page itself (first in the result),
 * followed by every descendant. A `scopePageId` that does not resolve to any
 * page in `pages` - a stale id, e.g. the scoped page was deleted while a tab
 * held it open - returns [] rather than throwing, so a caller can treat
 * "not found" the same as "empty scope" with no separate branch.
 */
export function collectScopePages(
  pages: InstitutionPage[],
  scopePageId: string | null
): InstitutionPage[] {
  const tree = buildPageTree(pages);

  if (scopePageId === null) {
    const out: InstitutionPage[] = [];
    flatten(tree, out);
    return out;
  }

  const node = findNode(tree, scopePageId);
  if (!node) return [];

  const out: InstitutionPage[] = [];
  flatten([node], out);
  return out;
}

/**
 * AC1(b)/(c)'s render gate: does this page have at least one child in the
 * RENDERED tree? A leaf page never gets the overview panel - AC1(c) requires
 * that view stay byte-for-byte what it is today. Uses buildPageTree rather
 * than a raw `pages.some(p => p.parentId === scopePageId)` scan for the same
 * reason collectScopePages does: a page's EFFECTIVE parent (what the sidebar
 * shows) can differ from its raw parentId when the raw data is corrupted -
 * an orphaned or cyclic parent link, see buildPageTree's own docstring - and
 * this gate must agree with what is on screen, not with the raw foreign key,
 * or the panel could appear on a page the sidebar draws as a leaf (or vanish
 * from one the sidebar draws with children).
 *
 * A scopePageId absent from `pages` (a deleted page) reports false, same as
 * an actual leaf - there is nothing to render a panel for either way.
 */
export function scopeHasDescendants(pages: InstitutionPage[], scopePageId: string): boolean {
  const node = findNode(buildPageTree(pages), scopePageId);
  return node != null && node.children.length > 0;
}

/**
 * The scopePhrase AC2's summary copy and AC1's panel heading read from:
 *   - institution scope:  "all 12 pages in MCC" / "the 1 page in MCC"
 *   - subtree scope:      "this page and its 7 sub-pages" /
 *                         "this page and its 1 sub-page"
 * Singular/plural is exact - a count of exactly 1 always reads as singular
 * English (never "all 1 page", never "its 1 sub-pages").
 *
 * Takes `pages` and computes the relevant count itself (via
 * collectScopePages) rather than accepting a pre-computed count as a
 * parameter, so this phrase and the actual set of pages the panel generates
 * from can never drift apart because a caller forgot to recompute one after
 * changing the other.
 */
export function describeScope(
  pages: InstitutionPage[],
  scopePageId: string | null,
  institution: string
): string {
  const scopePages = collectScopePages(pages, scopePageId);

  if (scopePageId === null) {
    const count = scopePages.length;
    return count === 1 ? `the 1 page in ${institution}` : `all ${count} pages in ${institution}`;
  }

  // collectScopePages puts the scope page itself first (see above), so the
  // sub-page count the copy names is one less than the full scoped list.
  const subPageCount = Math.max(0, scopePages.length - 1);
  return subPageCount === 1
    ? "this page and its 1 sub-page"
    : `this page and its ${subPageCount} sub-pages`;
}
