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

// The decision functions below were moved here from
// src/app/actions/discussion-replies.ts (Ruling 15: this leaf, not the "use
// server" action, is the accepted home for the outcome vocabulary - forcing
// a second copy into announcement-draft-slots.ts, as AC3-6 originally named,
// would duplicate exactly what AC3-5 forbids duplicating). Moved verbatim,
// exported, and with no behavior change: discussion-replies.ts now imports
// them from here instead of declaring them privately.

/** Y8: `{ kind, text, counts }` for a post whose search returned NO resources
 *  at all. Callers only reach this for a post with a REAL (non-empty)
 *  concept - an empty-concept post gets no outcome at all, so `co` is
 *  `undefined` here only when that non-empty concept was dropped past a
 *  per-run concept cap, which is precisely the "unknown (no entry)" case the
 *  acceptance criteria name. */
export function resourceSearchOutcomeFor(co: ConceptOutcome | undefined): ResourceSearchOutcome {
  if (!co) {
    return {
      kind: "unknown",
      text: "No links came back for these terms.",
      counts: ZERO_RESOURCE_SEARCH_COUNTS,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- rest-sibling destructure to exclude concept/failed from `counts`; pre-existing pattern, unrelated to this feature.
  const { concept: _concept, failed: _failed, ...counts } = co;
  let kind: ResourceSearchOutcomeKind;
  if (co.failed !== undefined) kind = "failed";
  else if (counts.sources === 0) kind = "no-sources";
  else if (counts.candidates === 0) kind = "no-candidates";
  else if (counts.kept === 0) kind = "all-dropped";
  // kept > 0 but this post still has no resources: every kept link for this
  // concept was a kind the instructor deselected, dropped by the caller's
  // own result-side filter - not anything the search step itself could have
  // reported a reason for.
  else kind = "unknown";
  return { kind, text: resourceSearchOutcomeText(kind, counts, co.failed), counts };
}

/** Y8: the first sentence of a thrown-error message, clamped to 60
 *  characters - never the whole (potentially long, multi-sentence) message,
 *  so `The search failed: {reason}` always stays under the 90-character
 *  budget for every outcome sentence. */
function clampFailedReason(failed: string): string {
  const match = failed.match(/^[^.!?]*[.!?]?/);
  const sentence = match ? match[0] : failed;
  return sentence.length > 60 ? sentence.slice(0, 60) : sentence;
}

/** Y8: the exact, frozen sentence for each outcome kind - each one under 90
 *  characters, "Search for resources" matching the row button's exact label.
 *  `counts` decides the two `all-dropped` variants and the `unknown` variant;
 *  `failedReason` is used only for `kind === "failed"`. */
export function resourceSearchOutcomeText(
  kind: ResourceSearchOutcomeKind,
  counts: Pick<ResourceSearchCounts, "candidates" | "droppedUnreachable" | "droppedUncorroborated" | "kept">,
  failedReason?: string
): string {
  switch (kind) {
    case "failed":
      return `The search failed: ${clampFailedReason(failedReason ?? "")}`;
    case "no-sources":
      return "No web pages came back this time. Search for resources again - it usually works.";
    case "no-candidates":
      return "Pages were searched, but none matched these terms. Editing the reply changes the terms.";
    case "all-dropped":
      // A concept whose candidates were ALL placeholders (droppedPlaceholder
      // === candidates, both other drop counts 0) must not read as "did not
      // open" - that sentence requires at least one actual unreachable drop;
      // otherwise (including the 0/0 placeholder-only case) it is "none
      // traced back to a real site", which is true whenever nothing was ever
      // corroborated or fetched.
      return counts.droppedUnreachable > 0 && counts.droppedUnreachable >= counts.droppedUncorroborated
        ? `Found ${counts.candidates} links, but the pages did not open. Search for resources again.`
        : `Found ${counts.candidates} links, but none traced back to a real site. Editing the reply changes the terms.`;
    case "unknown":
      // `kept > 0` means links WERE found for this concept but every one was
      // a resource kind the instructor deselected - a different reason from
      // "nothing was ever kept", which stays the generic sentence.
      return counts.kept > 0
        ? "Links were found, but not in the resource kinds you picked in Eligible resource kinds."
        : "No links came back for these terms.";
  }
}

/**
 * Ruling 19: any `failed` member forces the whole batch to `failed`. A
 * per-concept batch (e.g. every concept behind one G3 walkthrough-
 * announcement slot) must never collapse a real failure into "unknown" just
 * because it disagreed with the other concepts' outcomes - "No links came
 * back for these terms" is a materially different, and materially less
 * actionable, message than "the search failed".
 *
 * When every concept agrees on a kind other than `failed`, that shared kind
 * is returned as-is. When they disagree on anything other than a shared
 * failure, there is no single honest sentence for the mix, so this falls
 * back to the same "unknown, no entry" shape `resourceSearchOutcomeFor`
 * itself returns for a concept with no per-concept accounting at all.
 */
export function aggregateResourceOutcome(perConcept: readonly ConceptOutcome[]): ResourceSearchOutcome {
  if (perConcept.length === 0) return resourceSearchOutcomeFor(undefined);
  const outcomes = perConcept.map(resourceSearchOutcomeFor);
  const failed = outcomes.find((o) => o.kind === "failed");
  if (failed) return failed;
  const firstKind = outcomes[0].kind;
  const allSameKind = outcomes.every((o) => o.kind === firstKind);
  return allSameKind ? outcomes[0] : resourceSearchOutcomeFor(undefined);
}
