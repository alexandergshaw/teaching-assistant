import { describe, it, expect } from "vitest";

import {
  aggregateResourceOutcome,
  resourceSearchOutcomeFor,
  resourceSearchOutcomeText,
  ZERO_RESOURCE_SEARCH_COUNTS,
  type ConceptOutcome,
} from "./resource-search-outcome";

function concept(overrides: Partial<ConceptOutcome> = {}): ConceptOutcome {
  return {
    concept: "closures",
    sources: 1,
    resolvedSources: 1,
    candidates: 1,
    droppedPlaceholder: 0,
    droppedUncorroborated: 0,
    droppedDuplicate: 0,
    droppedUnreachable: 0,
    kept: 1,
    retried: false,
    ...overrides,
  };
}

describe("resourceSearchOutcomeFor - moved verbatim from discussion-replies.ts, now exported", () => {
  it("is exported and callable from its new home", () => {
    expect(typeof resourceSearchOutcomeFor).toBe("function");
  });

  it("returns 'unknown' with the frozen zero counts for an undefined per-concept entry", () => {
    const outcome = resourceSearchOutcomeFor(undefined);
    expect(outcome.kind).toBe("unknown");
    expect(outcome.counts).toBe(ZERO_RESOURCE_SEARCH_COUNTS);
  });

  it("returns 'failed' when the concept carries a failure reason", () => {
    const outcome = resourceSearchOutcomeFor(concept({ failed: "The grounded search call timed out badly." }));
    expect(outcome.kind).toBe("failed");
    expect(outcome.text).toContain("The search failed:");
  });

  it("returns 'no-sources' when nothing was found to search", () => {
    const outcome = resourceSearchOutcomeFor(concept({ sources: 0, candidates: 0, kept: 0 }));
    expect(outcome.kind).toBe("no-sources");
  });
});

describe("resourceSearchOutcomeText - exported for reuse by callers that need real prose from real counts", () => {
  it("produces the exact frozen sentence for 'no-candidates'", () => {
    const text = resourceSearchOutcomeText("no-candidates", { candidates: 0, droppedUnreachable: 0, droppedUncorroborated: 0, kept: 0 });
    expect(text).toBe("Pages were searched, but none matched these terms. Editing the reply changes the terms.");
  });
});

describe("aggregateResourceOutcome - Ruling 19: any failed member forces the whole batch to failed", () => {
  it("returns 'failed' when one concept failed alongside three empties, rather than collapsing to 'unknown'", () => {
    const perConcept: ConceptOutcome[] = [
      concept({ concept: "a", sources: 0, candidates: 0, kept: 0 }), // no-sources
      concept({ concept: "b", sources: 0, candidates: 0, kept: 0 }), // no-sources
      concept({ concept: "c", failed: "Network error." }), // failed
      concept({ concept: "d", sources: 0, candidates: 0, kept: 0 }), // no-sources
    ];

    const aggregate = aggregateResourceOutcome(perConcept);

    expect(aggregate.kind).toBe("failed");
  });

  // Sabotage used to prove this test can fail: temporarily change
  // aggregateResourceOutcome's `if (failed) return failed;` line to skip
  // straight to the allSameKind check (the withdrawn round-2 behavior
  // Ruling 19 struck down). Confirmed this makes the aggregate above resolve
  // to "unknown" ("No links came back for these terms") instead of "failed",
  // which fails the `toBe("failed")` assertion. Restored afterward.

  it("returns the shared kind when every concept agrees", () => {
    const perConcept: ConceptOutcome[] = [
      concept({ concept: "a", sources: 0, candidates: 0, kept: 0 }),
      concept({ concept: "b", sources: 0, candidates: 0, kept: 0 }),
    ];

    expect(aggregateResourceOutcome(perConcept).kind).toBe("no-sources");
  });

  it("falls back to the 'unknown, no entry' shape when concepts disagree without any failure", () => {
    const perConcept: ConceptOutcome[] = [
      concept({ concept: "a", sources: 0, candidates: 0, kept: 0 }), // no-sources
      concept({ concept: "b", sources: 1, candidates: 0, kept: 0 }), // no-candidates
    ];

    const aggregate = aggregateResourceOutcome(perConcept);
    expect(aggregate.kind).toBe("unknown");
  });

  it("returns the 'unknown, no entry' shape for an empty batch", () => {
    expect(aggregateResourceOutcome([]).kind).toBe("unknown");
  });
});
