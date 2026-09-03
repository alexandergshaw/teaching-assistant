// Unit tests for useReplyResources.ts's pure decision logic (set R-D).
// docs/discussion-reply-resources-acceptance-criteria.md R0-4, R7, R11.
//
// The hook itself is not renderable under this repo's node-env vitest (no
// hook is ever rendered - see useReplyRows.ts's own file header for the
// same discipline), so the three predicates that actually decide the
// drain's behaviour are pulled out and tested directly here: the
// capture-busy yield gate, `Find resources`' eligibility rule, and the
// resourceSeq staleness check.
//
// Every test below is sabotage-checked: broken, confirmed red, restored,
// confirmed green. See the report handed back to the dispatcher for which.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  isResourceLaneBusy,
  isFindMissingEligible,
  partitionResourceOutcome,
  shouldPushDegradedNotice,
  resourceQueueProgressText,
  redactAuthorNameFromText,
  resourceQueryForRow,
  outcomeById,
} from "./useReplyResources";
// F1 fix, then RC10 (docs/reply-resource-concepts-acceptance-criteria.md):
// isResourceBatchFresh moved to useReplyRows.ts first, then on to
// useReplyRowResourceMutators.ts (the leaf useReplyRows.ts pulled its
// resource mutators into to stay under the line cap) - useReplyRows.ts
// re-exports it, and it is now the ONLY caller in production (via
// resourcesUnchangedSince, itself defined in that same leaf). Importing it
// through useReplyRows.ts's re-export, rather than the leaf directly or a
// second copy, IS the point here: this import path is what
// `resourcesUnchangedSince`'s own callers use, so this test exercises the
// exact function that guard calls, not a parallel copy that could drift.
import { isResourceBatchFresh } from "./useReplyRows";
import type { ReplyRow } from "./discussion-capture";

// ---------------------------------------------------------------------------
// R0-4: isResourceLaneBusy - the drain's capture-busy yield gate.
// ---------------------------------------------------------------------------

describe("isResourceLaneBusy (R0-4)", () => {
  it("false when nothing is happening", () => {
    expect(isResourceLaneBusy({ capturing: false, pendingFrames: 0, extracting: false })).toBe(false);
  });

  it("true while capturing, even with no pending frames and not extracting", () => {
    expect(isResourceLaneBusy({ capturing: true, pendingFrames: 0, extracting: false })).toBe(true);
  });

  it("true when frames are still queued after capture has stopped (AC51's teardown flush)", () => {
    expect(isResourceLaneBusy({ capturing: false, pendingFrames: 3, extracting: false })).toBe(true);
  });

  it("true while extracting, even with capturing false and no pending frames", () => {
    expect(isResourceLaneBusy({ capturing: false, pendingFrames: 0, extracting: true })).toBe(true);
  });

  it("SABOTAGE CHECK (a): busy is true when ALL THREE signals are live at once", () => {
    // Guards against a mistaken `&&` in place of the real `||` chain - that
    // mutation would make this assertion pass too (true && true && true is
    // true), but the "nothing is happening" case above would then also flip
    // to a false negative under `||` turned into `&&` on the FALSE inputs;
    // both directions are covered by the two tests bracketing this one.
    expect(isResourceLaneBusy({ capturing: true, pendingFrames: 5, extracting: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R11: isFindMissingEligible - the bulk "Find resources" sweep's row filter.
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<Pick<ReplyRow, "resourceState" | "reply" | "skipped" | "resources" | "resourceSearchOutcome">>) {
  return { reply: "A drafted reply.", ...overrides };
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

describe("isFindMissingEligible (R11)", () => {
  it("eligible: resourceState undefined (never touched the feature) with a non-empty reply", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: undefined }))).toBe(true);
  });

  it("eligible: resourceState explicitly 'idle'", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "idle" }))).toBe(true);
  });

  it("NOT eligible: resourceState 'done' - searched, whatever the outcome, including a row the instructor emptied by hand", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "done" }))).toBe(false);
  });

  it("NOT eligible: resourceState 'searching' - already in flight", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "searching" }))).toBe(false);
  });

  it("NOT eligible: resourceState 'failed' - reachable only through that row's own Retry", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "failed" }))).toBe(false);
  });

  it("NOT eligible: idle but no reply text yet - nothing to search for", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "idle", reply: "" }))).toBe(false);
  });

  it("SABOTAGE CHECK (b): 'done' must stay excluded even though it shares 'has a reply' with the eligible cases", () => {
    // Guards against a mutation that drops the resourceState check entirely
    // and eligibility collapses to "has a reply" - which would re-search
    // every already-searched row on every click.
    expect(isFindMissingEligible(makeRow({ resourceState: "done", reply: "Already has resources." }))).toBe(false);
  });

  it("NOT eligible: skipped, even though otherwise eligible (D9) - sabotage target", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: undefined, skipped: true }))).toBe(false);
    expect(isFindMissingEligible(makeRow({ resourceState: "idle", skipped: true }))).toBe(false);
  });

  // -------------------------------------------------------------------
  // docs/reply-resource-search-yield-acceptance-criteria.md Y13: a "done"
  // row with no resources and an outcome (a real search ran and came back
  // empty, Y8) is ALSO eligible - one click retries every such row.
  // -------------------------------------------------------------------

  it("Y13: eligible - done, no resources, an outcome set (a real search came back empty)", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "done", resourceSearchOutcome: AN_OUTCOME }))).toBe(true);
  });

  it("Y13: NOT eligible - done, no resources, but no outcome (R11: the instructor emptied it by hand)", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "done" }))).toBe(false);
    expect(isFindMissingEligible(makeRow({ resourceState: "done", resources: [] }))).toBe(false);
  });

  it("Y13: NOT eligible - done, HAS resources, even with an outcome present (defensive - Y9 never actually produces this combination)", () => {
    expect(
      isFindMissingEligible(
        makeRow({
          resourceState: "done",
          resources: [{ title: "T", url: "https://x/1", kind: "doc" }],
          resourceSearchOutcome: AN_OUTCOME,
        })
      )
    ).toBe(false);
  });

  it("Y13: still excluded when skipped, even with done+empty+outcome", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "done", resourceSearchOutcome: AN_OUTCOME, skipped: true }))).toBe(false);
  });

  it("Y13: still excluded with no reply text, even with done+empty+outcome", () => {
    expect(isFindMissingEligible(makeRow({ resourceState: "done", resourceSearchOutcome: AN_OUTCOME, reply: "" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R7: isResourceBatchFresh - the resourceSeq staleness check.
// ---------------------------------------------------------------------------

describe("isResourceBatchFresh (R7)", () => {
  it("fresh: the current seq still equals the snapshot taken at dispatch", () => {
    expect(isResourceBatchFresh(0, 0)).toBe(true);
    expect(isResourceBatchFresh(3, 3)).toBe(true);
  });

  it("stale: the current seq has advanced past the dispatch snapshot (a removal landed while the search was in flight)", () => {
    expect(isResourceBatchFresh(1, 0)).toBe(false);
  });

  it("SABOTAGE CHECK (c): an inverted comparison would wrongly call the common (unchanged) case stale", () => {
    // The real bug this check exists to catch: `Find resources` re-queues a
    // row, the instructor removes a bad link while the search runs, the
    // batch lands, and an inverted `!==` would apply it anyway - resurrecting
    // the removed link. Pinned here as the equality direction itself, not
    // just the ref-backed plumbing that calls it in useReplyRows.ts.
    expect(isResourceBatchFresh(5, 5)).toBe(true);
    expect(isResourceBatchFresh(5, 5) === false).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F5: partitionResourceOutcome - the fix for a row wedging in "searching"
// forever when the resourceSeq guard rejects a landed batch.
// ---------------------------------------------------------------------------

describe("partitionResourceOutcome (F5)", () => {
  it("every id unchanged since dispatch lands entirely in 'unchanged'", () => {
    const result = partitionResourceOutcome(["a", "b"], () => true);
    expect(result).toEqual({ unchanged: ["a", "b"], changedMidFlight: [] });
  });

  it("every id changed since dispatch lands entirely in 'changedMidFlight'", () => {
    const result = partitionResourceOutcome(["a", "b"], () => false);
    expect(result).toEqual({ unchanged: [], changedMidFlight: ["a", "b"] });
  });

  it("splits a mixed batch by the predicate, preserving each id's original order within its bucket", () => {
    const changed = new Set(["b", "d"]);
    const result = partitionResourceOutcome(["a", "b", "c", "d"], (id) => !changed.has(id));
    expect(result).toEqual({ unchanged: ["a", "c"], changedMidFlight: ["b", "d"] });
  });

  it("empty input yields two empty arrays", () => {
    expect(partitionResourceOutcome([], () => true)).toEqual({ unchanged: [], changedMidFlight: [] });
  });

  it("SABOTAGE CHECK (d): swapping which bucket each branch pushes into would silently invert the partition", () => {
    // The bug this guards against: `changedMidFlight` is the set that gets
    // RESOLVED to a terminal state in useReplyResources.ts's drain (F5's
    // fix) - if the branches were swapped, an unchanged id (whose real
    // result should be applied) would instead be discarded as "changed",
    // and a changed id (which must NOT have applyResources called on it,
    // per R7) would be wrongly treated as safe to apply.
    const result = partitionResourceOutcome(["only-id"], () => true);
    expect(result.unchanged).toContain("only-id");
    expect(result.changedMidFlight).not.toContain("only-id");
  });
});

// ---------------------------------------------------------------------------
// F8: shouldPushDegradedNotice (R4e) - the embedded-provider capability
// limit must not go through the per-batch notice channel.
// ---------------------------------------------------------------------------

describe("shouldPushDegradedNotice (F8/R4e)", () => {
  it("false when the batch is not degraded at all, regardless of provider", () => {
    expect(shouldPushDegradedNotice(false, "gemini")).toBe(false);
    expect(shouldPushDegradedNotice(false, "embedded")).toBe(false);
  });

  it("true for a real degraded batch on a real provider", () => {
    expect(shouldPushDegradedNotice(true, "gemini")).toBe(true);
    expect(shouldPushDegradedNotice(true, "other")).toBe(true);
  });

  it("false for a degraded batch on the embedded provider - R4e's whole point", () => {
    expect(shouldPushDegradedNotice(true, "embedded")).toBe(false);
  });

  it("SABOTAGE CHECK (e): dropping the provider check entirely would route the embedded case through the notice channel R4e forbids", () => {
    // The bug this exists to catch: `if (degraded)` alone (no provider
    // check) would push RESOURCE_DEGRADED_NOTICE on every single
    // embedded-provider batch for the whole session - exactly what R4e says
    // must not happen, since a capability limit is not a failure.
    expect(shouldPushDegradedNotice(true, "embedded")).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F9: resourceQueueProgressText - the wording must not claim active work
// while the drain is yielded (R0-4).
// ---------------------------------------------------------------------------

describe("resourceQueueProgressText (F9)", () => {
  it("names active work when the lane is not busy", () => {
    expect(resourceQueueProgressText(3, false)).toBe("Finding resources for 3 more replies...");
  });

  it("singular 'reply' at exactly 1, not busy", () => {
    expect(resourceQueueProgressText(1, false)).toBe("Finding resources for 1 more reply...");
  });

  it("names the wait, not activity, when the lane IS busy - the fix itself", () => {
    const text = resourceQueueProgressText(3, true);
    expect(text).not.toContain("Finding resources");
    expect(text).toContain("3");
    expect(text).toContain("queued");
  });

  it("singular 'reply' at exactly 1, busy", () => {
    expect(resourceQueueProgressText(1, true)).toBe("1 reply queued for resources - search resumes once the capture finishes.");
  });

  it("SABOTAGE CHECK (f): a busy queue's text must never claim present-tense 'finding' - the exact stall this fix removes", () => {
    expect(resourceQueueProgressText(5, true)).not.toMatch(/Finding resources/);
  });
});

// ---------------------------------------------------------------------------
// THE PRIVACY BLOCKER: redactAuthorNameFromText / deriveRowSearchConcept.
// Since entry 373 a drafted reply can open with the student's first name
// ("Maria, your point about..."); the per-row targeted search sends the
// post AND the reply to an external resource search, so the author's name
// must never leave the app in that request. This is not a nicety - it is
// pinned as a required test per the resource-controls brief.
// ---------------------------------------------------------------------------

describe("redactAuthorNameFromText (the privacy blocker)", () => {
  it("the exact case the brief names: a reply opening 'Maria, your point about...' produces text containing no 'Maria'", () => {
    const result = redactAuthorNameFromText("Maria, your point about the second reading was great.", "Maria Lopez");
    expect(result.toLowerCase()).not.toContain("maria");
    expect(result).toBe("your point about the second reading was great.");
  });

  it("strips the derived LAST name too, not only the greeting first name - the post half can independently mention the full name", () => {
    const result = redactAuthorNameFromText("A post signed off as Maria Lopez, discussing recursion.", "Maria Lopez");
    expect(result.toLowerCase()).not.toContain("maria");
    expect(result.toLowerCase()).not.toContain("lopez");
  });

  it("strips a mid-sentence, case-varied occurrence, not just a leading greeting", () => {
    const result = redactAuthorNameFromText("Great job, MARIA! Loved reading this.", "Maria Lopez");
    expect(result.toLowerCase()).not.toContain("maria");
  });

  it("strips an all-lowercase occurrence too", () => {
    const result = redactAuthorNameFromText("as maria pointed out earlier", "Maria Lopez");
    expect(result.toLowerCase()).not.toContain("maria");
  });

  it("does NOT strip a name that only shares a substring - word-boundary matching, not a bare .includes()", () => {
    // "Marian" contains "Maria" as a substring; \b matching must not gut it.
    const result = redactAuthorNameFromText("The Marian era of the reform.", "Maria Lopez");
    expect(result).toContain("Marian");
  });

  it("a mononym author (single token) still gets its greeting name stripped", () => {
    const result = redactAuthorNameFromText("Aisha, nice work on this.", "Aisha");
    expect(result.toLowerCase()).not.toContain("aisha");
  });

  it("empty author leaves the text untouched aside from the trim/whitespace cleanup", () => {
    expect(redactAuthorNameFromText("Just some text.", "")).toBe("Just some text.");
  });

  it("SABOTAGE CHECK: a name embedded in a comma-form 'Last, First' author string is still fully stripped from both derived forms", () => {
    const result = redactAuthorNameFromText("Diego mentioned Chen's paper and Diego's own point.", "Chen, Diego");
    expect(result.toLowerCase()).not.toContain("diego");
    expect(result.toLowerCase()).not.toContain("chen");
  });
});

// ---------------------------------------------------------------------------
// docs/reply-resource-concepts-acceptance-criteria.md RC4: resourceQueryForRow
// - the one function that decides what a resource search sends, for both the
// automatic drain (mode "auto") and the per-row targeted search (mode
// "manual"). Supersedes `deriveRowSearchConcept` (deleted) - the five tests
// immediately below are that function's own tests, moved verbatim onto
// `resourceQueryForRow(..., "manual")` (its prose-fallback rule, post +
// reply, is the same rule `deriveRowSearchConcept` used to apply
// unconditionally). The describe block after it covers what is new: concepts
// preferred over prose, the "; " joiner, the all-name fallback twin, a
// mangled-but-lettered term sent as-is, and the source value per case.
// ---------------------------------------------------------------------------

function makeQueryRow(overrides: Partial<Pick<ReplyRow, "post" | "reply" | "author" | "concepts">>) {
  return { post: "", reply: "", author: "", concepts: undefined, ...overrides };
}

describe("resourceQueryForRow, mode 'manual' (moved verbatim from deriveRowSearchConcept)", () => {
  it("combines post and reply text into one query", () => {
    const result = resourceQueryForRow(
      makeQueryRow({ post: "A post about recursion in Python.", reply: "Nice example of a base case.", author: "Sam Lee" }),
      "manual"
    );
    expect(result.text).toContain("recursion");
    expect(result.text).toContain("base case");
  });

  it("the combined query contains no form of the author's name, even when both halves mention it", () => {
    const result = resourceQueryForRow(
      makeQueryRow({
        post: "Sam Lee here, discussing merge sort complexity.",
        reply: "Sam, your analysis of merge sort was spot on.",
        author: "Sam Lee",
      }),
      "manual"
    );
    expect(result.text.toLowerCase()).not.toContain("sam");
    expect(result.text.toLowerCase()).not.toContain("lee");
  });

  it("empty post and empty reply yields an empty query - nothing to search for", () => {
    expect(resourceQueryForRow(makeQueryRow({ post: "", reply: "", author: "Sam Lee" }), "manual").text).toBe("");
    expect(resourceQueryForRow(makeQueryRow({ post: "   ", reply: "  \n ", author: "Sam Lee" }), "manual").text).toBe("");
  });

  it("a post with no reply yet still yields a searchable query from the post alone", () => {
    const result = resourceQueryForRow(
      makeQueryRow({ post: "A detailed post about binary search trees.", reply: "", author: "Sam Lee" }),
      "manual"
    );
    expect(result.text).toContain("binary search trees");
  });

  it("SABOTAGE CHECK: dropping the redaction step would leak the name straight through - pinned against the exact function this hook calls, not a re-implementation", () => {
    const result = resourceQueryForRow(makeQueryRow({ post: "Post text.", reply: "Maria, thanks for sharing.", author: "Maria Lopez" }), "manual");
    expect(result.text).not.toMatch(/\bmaria\b/i);
  });
});

describe("resourceQueryForRow: concepts vs. prose, the source it reports, and the fallback rule (RC4)", () => {
  it("concepts win over prose in auto mode - source 'concepts'", () => {
    const result = resourceQueryForRow(
      makeQueryRow({ post: "A post about photosynthesis.", concepts: ["chlorophyll", "light reactions"] }),
      "auto"
    );
    expect(result.text).toBe("chlorophyll; light reactions");
    expect(result.source).toBe("concepts");
  });

  it("concepts win over prose in manual mode too - source 'concepts'", () => {
    const result = resourceQueryForRow(
      makeQueryRow({
        post: "A post about photosynthesis.",
        reply: "A reply about the Calvin cycle.",
        concepts: ["chlorophyll", "light reactions"],
      }),
      "manual"
    );
    expect(result.text).toBe("chlorophyll; light reactions");
    expect(result.source).toBe("concepts");
  });

  it("multiple concepts are joined with '; '", () => {
    const result = resourceQueryForRow(makeQueryRow({ concepts: ["a", "b", "c"] }), "auto");
    expect(result.text).toBe("a; b; c");
  });

  it("an empty concepts array is treated the same as absent - falls back to the prose base, source 'post'", () => {
    const result = resourceQueryForRow(makeQueryRow({ post: "A post about graph theory.", concepts: [] }), "auto");
    expect(result.source).toBe("post");
    expect(result.text).toContain("graph theory");
  });

  it("no concepts at all falls back to the post alone in auto mode - source 'post'", () => {
    const result = resourceQueryForRow(makeQueryRow({ post: "A post about entropy." }), "auto");
    expect(result.source).toBe("post");
    expect(result.text).toContain("entropy");
  });

  it("no concepts at all falls back to post + reply in manual mode - source 'post-reply'", () => {
    const result = resourceQueryForRow(makeQueryRow({ post: "A post about entropy.", reply: "A reply about disorder." }), "manual");
    expect(result.source).toBe("post-reply");
    expect(result.text).toContain("entropy");
    expect(result.text).toContain("disorder");
  });

  it("an all-name concept set falls back to the prose base - the :314 twin: no name survives in the fallback either", () => {
    const result = resourceQueryForRow(
      makeQueryRow({
        post: "Maria Lopez here, discussing recursion in Python.",
        author: "Maria Lopez",
        concepts: ["Maria Lopez"],
      }),
      "auto"
    );
    expect(result.source).toBe("post");
    expect(result.text.toLowerCase()).not.toContain("maria");
    expect(result.text.toLowerCase()).not.toContain("lopez");
    expect(result.text).toContain("recursion");
  });

  it("a mangled term (redaction leaves a fragment with letters still in it) is sent AS MANGLED, not dropped or re-derived", () => {
    // The exact case the AC measures: "Newton's laws of motion" under author
    // Isaac Newton redacts to "'s laws of motion" - "Newton" is gone but
    // "laws of motion" still has letters, so this passes the hasLetters gate
    // and is sent exactly as mangled (the log shows it, per RC7).
    const result = resourceQueryForRow(makeQueryRow({ author: "Isaac Newton", concepts: ["Newton's laws of motion"] }), "auto");
    expect(result.source).toBe("concepts");
    expect(result.text).toContain("laws of motion");
    expect(result.text.toLowerCase()).not.toContain("newton");
  });

  it("a concept that IS entirely the author's name redacts to no letters and falls back, source 'post'", () => {
    const result = resourceQueryForRow(makeQueryRow({ post: "A post about ethics.", author: "Isaac Newton", concepts: ["Isaac Newton"] }), "auto");
    expect(result.source).toBe("post");
    expect(result.text).toContain("ethics");
  });
});

// ---------------------------------------------------------------------------
// docs/reply-resource-search-yield-acceptance-criteria.md Y8/Y9: outcomeById
// - the pure id -> outcome lookup the drain and dispatchRowSearch both build
// from gatherReplyResourcesAction's own result and pass into applyResources.
// ---------------------------------------------------------------------------

describe("outcomeById (Y8/Y9)", () => {
  it("maps each id to its own outcome", () => {
    const map = outcomeById([
      { id: "p1", outcome: AN_OUTCOME },
      { id: "p2" },
    ]);
    expect(map.get("p1")).toEqual(AN_OUTCOME);
    expect(map.get("p2")).toBeUndefined();
  });

  it("an id absent from the result maps to undefined via Map.get's own default, not a thrown lookup", () => {
    const map = outcomeById([{ id: "p1", outcome: AN_OUTCOME }]);
    expect(map.get("p2")).toBeUndefined();
  });

  it("empty input yields an empty map", () => {
    expect(outcomeById([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// docs/reply-resource-search-yield-acceptance-criteria.md Y8/Y9/Y11: the
// drain and dispatchRowSearch wiring, and the retired notice text. Nothing
// in this repo's test suite ever exercises the bulk drain end to end (vitest
// here is node-env and renders no hook - see this repo's own AGENTS.md), so
// these are pinned by reading the source, the same idiom
// resourceQuery.wiring.test.ts and discussionReplyResources.wiring.test.ts
// already use for this exact class of gap. Comments stripped first, same
// habit as those two files.
// ---------------------------------------------------------------------------

function readSource(relativeToThisFile: string): string {
  return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const resourcesHookSource = readSource("./useReplyResources.ts");

describe("Y11: the batch notice text is retired and replaced", () => {
  it("the old generic sentence is gone; the new, specific sentence is present", () => {
    expect(resourcesHookSource).not.toContain(
      "Some resource results could not be fully gathered for this batch and may be incomplete."
    );
    expect(resourcesHookSource).toContain(
      "No web pages came back for this batch. Find resources retries every reply that came back empty."
    );
  });
});

// Fixer pass (verifier finding 4): the previous version of this block pinned
// two exact call-site strings (`applyResources(id, found, outcomes.get(id))`
// and a negative match on the old two-argument `applyResources(id, found);`)
// as frozen literals, so a behaviour-preserving rewrite - renaming a local,
// reformatting the call, reordering the map lookup - would fail even though
// Y9's actual contract (every call site passes a third, outcome-derived
// argument) was untouched. Pin the FACTS instead: every applyResources call
// site in this hook takes three arguments, the drain's third argument reads
// the `outcomes` map built just above it, and dispatchRowSearch's third
// argument is the per-row entry's own outcome - not one frozen call string.
describe("Y8/Y9: applyResources receives a third, outcome-derived argument at every call site", () => {
  // Balanced-paren extraction (not a plain `[^)]*`): the drain's call site
  // nests one level of parens (`outcomes.get(id)`), which a naive
  // "stop at the first )" regex would truncate before the call's own closing
  // paren.
  function applyResourcesCalls(source: string): string[] {
    const re = /applyResources\(((?:[^()]|\([^()]*\))*)\)/g;
    return Array.from(source.matchAll(re), (m) => m[0]);
  }

  function args(call: string): string[] {
    const inner = call.slice("applyResources(".length, -1);
    return inner.split(",").map((a) => a.trim());
  }

  it("every applyResources call site in this hook passes exactly three arguments - none is a bare two-argument call missing the outcome", () => {
    const calls = applyResourcesCalls(resourcesHookSource);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(args(call)).toHaveLength(3);
    }
  });

  it("the drain builds an outcomes map from outcomeById(result.resources), and its applyResources call's third argument reads that map by id", () => {
    expect(resourcesHookSource).toMatch(/const outcomes = outcomeById\(result\.resources\)/);
    const drainCall = applyResourcesCalls(resourcesHookSource).find((c) => args(c)[2] === "outcomes.get(id)");
    expect(drainCall).toBeDefined();
  });

  it("dispatchRowSearch (the per-row targeted search) passes the entry's own resources and outcome, not the drain's outcomes map", () => {
    const entryCall = applyResourcesCalls(resourcesHookSource).find((c) => args(c)[2] === "entry.outcome");
    expect(entryCall).toBeDefined();
    expect(args(entryCall!)[1]).toBe("entry.resources");
  });
});
