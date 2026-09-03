// The per-concept accounting a resource search returns, and the per-reply
// outcome a discussion row keeps when that search came back empty. A neutral,
// dependency-free leaf so that the "use server" action that computes the
// counts (src/app/actions/learning-resource-links.ts), the "use server" action
// that turns them into a sentence (src/app/actions/discussion-replies.ts) and
// the client-side row leaf that persists them
// (src/app/components/recording/discussion-serialization.ts) all read ONE
// definition - none of them may import a value from another, because a
// "use server" module exports only async functions and a client leaf must
// never pull server-only code into the browser bundle.
// docs/reply-resource-search-yield-acceptance-criteria.md Y5, Y8, Y9.

/** One bounded concept's journey through the four gates (Y5). Per concept:
 *  `failed` set => every count is 0; `candidates` = items parsed from the
 *  structuring call; `droppedPlaceholder + nonPlaceholder = candidates`;
 *  `droppedUncorroborated + survivors = nonPlaceholder`;
 *  `droppedDuplicate + droppedUnreachable + kept = survivors`. Counts are
 *  over (concept, item) pairs, not distinct URLs. `droppedDuplicate` counts a
 *  survivor dropped because it repeated (same concept, same url) an earlier
 *  survivor - it never reaches the reachability check, so it is never
 *  confused with `droppedUnreachable` (a url that WAS checked and failed). */
export interface ConceptOutcome {
  concept: string;
  sources: number;
  resolvedSources: number;
  candidates: number;
  droppedPlaceholder: number;
  droppedUncorroborated: number;
  droppedDuplicate: number;
  droppedUnreachable: number;
  kept: number;
  retried: boolean;
  failed?: string;
}

/** The numbers a reply row persists alongside its outcome sentence - every
 *  ConceptOutcome field except the concept string and the failure reason,
 *  which the sentence already carries. */
export type ResourceSearchCounts = Pick<
  ConceptOutcome,
  | "sources"
  | "resolvedSources"
  | "candidates"
  | "droppedPlaceholder"
  | "droppedUncorroborated"
  | "droppedDuplicate"
  | "droppedUnreachable"
  | "kept"
  | "retried"
>;

/** Why a reply ended a search with no links (Y8). `all-dropped` only when
 *  `kept === 0`; `unknown` covers both "no per-concept entry" and "links
 *  were kept but every one was a deselected kind". */
export type ResourceSearchOutcomeKind = "failed" | "no-sources" | "no-candidates" | "all-dropped" | "unknown";

export interface ResourceSearchOutcome {
  kind: ResourceSearchOutcomeKind;
  text: string;
  counts: ResourceSearchCounts;
}

/** Frozen: one shared object is handed by reference into every `unknown`
 *  outcome and then persisted onto many rows. */
export const ZERO_RESOURCE_SEARCH_COUNTS: Readonly<ResourceSearchCounts> = Object.freeze({
  sources: 0,
  resolvedSources: 0,
  candidates: 0,
  droppedPlaceholder: 0,
  droppedUncorroborated: 0,
  droppedDuplicate: 0,
  droppedUnreachable: 0,
  kept: 0,
  retried: false,
});
