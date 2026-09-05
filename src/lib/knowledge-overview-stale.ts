// Pure staleness detection for a generated knowledge overview summary (see
// AC3, amended - CORRECTIONS.md X4 - and C2's adjudication in BUILD.md). This
// module does exactly one thing: given the (id, title, updatedAt) snapshot a
// summary was generated from and the CURRENT scope pages, say whether an
// instructor should regenerate, and name which pages changed.
//
// THE ONE RULE THIS FILE ENFORCES ON ITSELF: no Date.parse, no `>`, no clock
// of any kind, anywhere below. institution_pages.updated_at is written by
// this app's own Node process clock (`new Date().toISOString()` inside
// updateInstitutionPage); institution_knowledge_summaries.generated_at is
// written the same way at generation time, but the column also carries a
// `default now()` for a hand-written or migrated row - a second, DATABASE
// clock that was never promised to agree with the app's clock. Comparing "is
// this page's updatedAt string newer than that summary's generatedAt string"
// across those two clocks has a real failure mode: a page edited seconds
// before generation, then read back through a default-now() timestamp with
// even a small amount of skew, can read as "newer than the summary" forever
// - a summary born stale that a regenerate can never clear. A pure,
// id-keyed SET DIFF has no such failure mode: it never asks "when", only "is
// this the same (id, updatedAt) snapshot as before".
//
// WHERE THIS RUNS: at render, inside the panel, over the `pages` array the
// Knowledge tab already holds in React state (see BUILD.md's "WHERE
// STALENESS RUNS"). Deliberately NOT a database view/RPC (that would freeze
// staleness at query time, so the panel could say "current" for a summary
// the user can see is out of date on screen the moment they edit a page
// without a reload) and NOT a flag computed once at generation time and
// stored (that flag would freeze AT GENERATION and could never become true
// afterward - a Stale badge that is always false is dead code that happens
// to pass every test written against a summary that was never edited after).

import type { InstitutionPage } from "./knowledge-base";

/**
 * The minimal (id, updatedAt) snapshot of a page, isolated from its
 * title/body/tags/etc. - the two fields that fully determine whether a page
 * counts as "changed" for this feature. Sorted by id wherever it is produced
 * (see fingerprintScopePages) so two independent computations over the same
 * page set always produce identical list VALUES in identical ORDER, which
 * matters if a caller ever serializes this list directly (e.g. as part of a
 * cache key) rather than only feeding it into summaryStaleness.
 */
export interface PageFingerprint {
  id: string;
  updatedAt: string;
}

/**
 * Canonical, id-sorted fingerprints for a set of pages. Exported so the
 * server pipeline that persists institution_knowledge_summaries.source_pages
 * at generation time and this module's own tests derive the identical
 * (id, updatedAt) shape from an InstitutionPage[] in exactly one place,
 * rather than each hand-rolling
 * `pages.map(p => ({ id: p.id, updatedAt: p.updatedAt }))`
 * and risking the two copies drifting apart under a future edit to either.
 */
export function fingerprintScopePages(pages: InstitutionPage[]): PageFingerprint[] {
  return pages
    .map((p): PageFingerprint => ({ id: p.id, updatedAt: p.updatedAt }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Declared in this order deliberately: summaryStaleness below always pushes
 * reasons in this same sequence (edited, then added, then removed), so a
 * caller rendering `reasons.join(", ")` or mapping reasons to copy gets a
 * stable, deterministic result regardless of which ids happen to sort first,
 * rather than an order that silently depends on Map/Set iteration.
 */
export type SummaryStaleReason = "page-edited" | "page-added" | "page-removed";

/**
 * The minimal stored shape summaryStaleness needs from a persisted summary's
 * source_pages: enough to notice a page's content changed (updatedAt), to
 * notice it is gone entirely (id, by its absence from the current set), and
 * to name it in `removedTitles` after it can no longer supply its own title
 * because it no longer exists (title).
 *
 * Deliberately NOT importing SummarySourcePage from knowledge-overview.ts -
 * the data-layer module developed concurrently with this one, which also
 * carries `included` and a differently-cased field set. A caller holding
 * that richer stored shape satisfies this interface structurally with no
 * cast, since TypeScript accepts an object with extra properties wherever a
 * narrower shape is expected; this file stays fully independent of that
 * module's export surface either way.
 */
export interface StoredSourcePage {
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * AC3's staleness verdict. `stale` is true exactly when `reasons` is
 * non-empty. The three title lists are what AC3's UI copy actually renders
 * ("3 pages changed since this summary was written:") - never re-derived
 * from a bare count, since a count alone cannot say WHICH pages changed, and
 * a delete-plus-add that nets to the same total page count would otherwise
 * look identical to "nothing changed" if only counts were compared.
 */
export interface SummaryStaleness {
  stale: boolean;
  reasons: SummaryStaleReason[];
  changedTitles: string[];
  addedTitles: string[];
  removedTitles: string[];
}

/**
 * Pure set diff between what a summary was generated from
 * (`storedSourcePages`, the persisted source_pages snapshot) and what the
 * scope looks like right now (`currentScopePages`, e.g. collectScopePages's
 * live result). See this file's header for why this is a set diff and never
 * a clock comparison.
 *
 *   removed = a stored id absent from the current pages
 *     THE CASE A REVIEWER ASSUMES IS COVERED AND IS NOT (see BUILD.md /
 *     CORRECTIONS.md C2): a DELETE bumps nobody's updated_at, because there
 *     is no longer a row to bump. There is no "differing updatedAt" to
 *     notice for a deleted page - the ONLY signal a delete ever leaves
 *     behind is its id disappearing from the current set entirely, which is
 *     exactly what this branch (and only this branch) detects.
 *   added   = a current id absent from the stored snapshot
 *   changed = an id present in BOTH whose updatedAt strings differ
 *             (STRING INEQUALITY, never `>` or Date.parse - see the header)
 *
 * Every id is visited exactly once, in a single deterministic ascending sort
 * over the UNION of both id sets - never in whichever order either input
 * array happens to arrive in - so `changedTitles` / `addedTitles` /
 * `removedTitles` are stable across renders even though `currentScopePages`
 * is a freshly-computed array (same pages, new array identity) on every
 * call.
 */
export function summaryStaleness(
  storedSourcePages: StoredSourcePage[],
  currentScopePages: InstitutionPage[]
): SummaryStaleness {
  const storedById = new Map(storedSourcePages.map((p) => [p.id, p]));
  const currentById = new Map(currentScopePages.map((p) => [p.id, p]));
  const allIds = Array.from(new Set([...storedById.keys(), ...currentById.keys()])).sort((a, b) =>
    a.localeCompare(b)
  );

  const changedTitles: string[] = [];
  const addedTitles: string[] = [];
  const removedTitles: string[] = [];

  for (const id of allIds) {
    const stored = storedById.get(id);
    const current = currentById.get(id);

    if (stored && !current) {
      removedTitles.push(stored.title);
    } else if (current && !stored) {
      addedTitles.push(current.title);
    } else if (stored && current && stored.updatedAt !== current.updatedAt) {
      changedTitles.push(current.title);
    }
  }

  const reasons: SummaryStaleReason[] = [];
  if (changedTitles.length > 0) reasons.push("page-edited");
  if (addedTitles.length > 0) reasons.push("page-added");
  if (removedTitles.length > 0) reasons.push("page-removed");

  return {
    stale: reasons.length > 0,
    reasons,
    changedTitles,
    addedTitles,
    removedTitles,
  };
}
