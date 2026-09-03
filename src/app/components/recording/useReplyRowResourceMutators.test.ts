// Unit tests for useReplyRowResourceMutators.ts's pure row transformations.
// docs/reply-resource-search-yield-acceptance-criteria.md Y9.
//
// The hook itself is not renderable under this repo's node-env vitest (no
// hook is ever rendered - see useReplyRows.ts's own file header for the same
// discipline, and useReplyResources.test.ts for the sibling drain hook's own
// version of this note), so the PURE row-transformation functions the three
// touched mutators (applyResources/markResourceSearching/markResourceFailed)
// delegate to are pulled out and tested directly here - mirroring
// isResourceBatchFresh's own extraction (this same file, RC10/F1) for
// exactly the same reason: "a comparison/transform buried inside a
// useCallback body has no test surface of its own".
//
// Every test below is sabotage-checked - see the report handed back to the
// dispatcher for which.

import { describe, it, expect } from "vitest";
import {
  isResourceBatchFresh,
  nextRowAfterApplyResources,
  nextRowAfterMarkResourceSearching,
  nextRowAfterMarkResourceFailed,
} from "./useReplyRowResourceMutators";
import type { ReplyRow } from "./discussion-serialization";

function makeRow(overrides: Partial<ReplyRow> = {}): ReplyRow {
  return {
    id: "r1",
    author: "Maria Alvarez",
    post: "Some post text",
    reply: "A drafted reply.",
    userEdited: false,
    state: "ready",
    error: null,
    firstSeenAt: 1000,
    order: 0,
    ...overrides,
  };
}

const AN_OUTCOME: NonNullable<ReplyRow["resourceSearchOutcome"]> = {
  kind: "no-sources",
  text: "No web pages were searched this time. Search for resources again - it usually works.",
  counts: {
    sources: 0,
    resolvedSources: 0,
    candidates: 0,
    droppedPlaceholder: 0,
    droppedUncorroborated: 0,
    droppedDuplicate: 0,
    droppedUnreachable: 0,
    kept: 0,
    retried: false,
  },
};

// ---------------------------------------------------------------------------
// R7: isResourceBatchFresh - already covered end to end by
// useReplyResources.test.ts (which reaches it through useReplyRows.ts's own
// re-export, the path production actually uses), but the leaf that OWNS it
// gets its own direct pin too, so a future split of this file does not
// silently lose direct coverage of the function it defines.
// ---------------------------------------------------------------------------

describe("isResourceBatchFresh (R7)", () => {
  it("fresh: the current seq still equals the snapshot taken at dispatch", () => {
    expect(isResourceBatchFresh(0, 0)).toBe(true);
    expect(isResourceBatchFresh(4, 4)).toBe(true);
  });

  it("stale: the current seq has advanced past the dispatch snapshot", () => {
    expect(isResourceBatchFresh(1, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Y9: nextRowAfterApplyResources - applyResources' own per-row transform.
// ---------------------------------------------------------------------------

describe("nextRowAfterApplyResources (Y9)", () => {
  it("an empty result stores the outcome and sets resourceState to 'done'", () => {
    const row = makeRow({ resourceState: "searching" });
    const next = nextRowAfterApplyResources(row, [], AN_OUTCOME);
    expect(next.resourceState).toBe("done");
    expect(next.resources).toEqual([]);
    expect(next.resourceError).toBeNull();
    expect(next.resourceSearchOutcome).toEqual(AN_OUTCOME);
  });

  it("a later non-empty apply clears a previously-stored outcome", () => {
    const row = makeRow({ resourceState: "done", resourceSearchOutcome: AN_OUTCOME });
    const next = nextRowAfterApplyResources(row, [{ title: "T", url: "https://x/1", kind: "doc" }], undefined);
    expect(next.resourceState).toBe("done");
    expect(next.resources).toEqual([{ title: "T", url: "https://x/1", kind: "doc" }]);
    expect(next.resourceSearchOutcome).toBeUndefined();
  });

  it("SABOTAGE CHECK: a non-empty result clears the outcome even if the caller passed one anyway (defensive)", () => {
    // Guards against a mutation that stores `outcome` unconditionally
    // (dropping the `resources.length === 0 ? outcome : undefined` ternary)
    // - gatherReplyResourcesAction's own contract never sets an outcome for
    // a non-empty result, but this function must not trust that from the
    // outside; a caller that did pass one anyway must still see it dropped.
    const row = makeRow({ resourceState: "searching" });
    const next = nextRowAfterApplyResources(row, [{ title: "T", url: "https://x/1", kind: "doc" }], AN_OUTCOME);
    expect(next.resourceSearchOutcome).toBeUndefined();
  });

  it("resourceState becomes 'done' even when resources is empty and no outcome is supplied (R11: a searched-but-empty row is still 'done', not a default)", () => {
    const row = makeRow({ resourceState: "searching" });
    const next = nextRowAfterApplyResources(row, [], undefined);
    expect(next.resourceState).toBe("done");
    expect(next.resourceSearchOutcome).toBeUndefined();
  });

  it("does not mutate the input row (returns a new object)", () => {
    const row = makeRow({ resourceState: "searching" });
    const next = nextRowAfterApplyResources(row, [], AN_OUTCOME);
    expect(next).not.toBe(row);
    expect(row.resourceState).toBe("searching");
  });
});

// ---------------------------------------------------------------------------
// Y9: nextRowAfterMarkResourceSearching - clears a stale outcome the moment
// a new search starts (RC4's own query-recording behaviour is unchanged).
// ---------------------------------------------------------------------------

describe("nextRowAfterMarkResourceSearching (Y9)", () => {
  it("markResourceSearching clears a previously-stored outcome", () => {
    const row = makeRow({ resourceState: "done", resourceSearchOutcome: AN_OUTCOME });
    const next = nextRowAfterMarkResourceSearching(row, undefined);
    expect(next.resourceState).toBe("searching");
    expect(next.resourceError).toBeNull();
    expect(next.resourceSearchOutcome).toBeUndefined();
  });

  it("RC4: a supplied query sets resourceQuery/resourceQuerySource, unaffected by the Y9 outcome clear", () => {
    const row = makeRow({ resourceState: "idle" });
    const next = nextRowAfterMarkResourceSearching(row, { text: "chlorophyll", source: "concepts" });
    expect(next.resourceQuery).toBe("chlorophyll");
    expect(next.resourceQuerySource).toBe("concepts");
    expect(next.resourceSearchOutcome).toBeUndefined();
  });

  it("RC4: no query supplied leaves resourceQuery/resourceQuerySource untouched (never cleared)", () => {
    const row = makeRow({ resourceState: "idle", resourceQuery: "old query", resourceQuerySource: "post" });
    const next = nextRowAfterMarkResourceSearching(row, undefined);
    expect(next.resourceQuery).toBe("old query");
    expect(next.resourceQuerySource).toBe("post");
  });
});

// ---------------------------------------------------------------------------
// Y9: nextRowAfterMarkResourceFailed - clears a stale outcome on failure too
// (the row's own resourceError already explains the failure).
// ---------------------------------------------------------------------------

describe("nextRowAfterMarkResourceFailed (Y9)", () => {
  it("markResourceFailed clears a previously-stored outcome", () => {
    const row = makeRow({ resourceState: "searching", resourceSearchOutcome: AN_OUTCOME });
    const next = nextRowAfterMarkResourceFailed(row, "The search timed out.");
    expect(next.resourceState).toBe("failed");
    expect(next.resourceError).toBe("The search timed out.");
    expect(next.resourceSearchOutcome).toBeUndefined();
  });

  it("SABOTAGE CHECK: the outcome is cleared even when the row never had one (idempotent, not a conditional clear)", () => {
    const row = makeRow({ resourceState: "searching" });
    const next = nextRowAfterMarkResourceFailed(row, "boom");
    expect(next.resourceSearchOutcome).toBeUndefined();
  });
});
