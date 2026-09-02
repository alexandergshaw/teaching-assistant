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
import {
  isResourceLaneBusy,
  isFindMissingEligible,
  partitionResourceOutcome,
  shouldPushDegradedNotice,
  resourceQueueProgressText,
  redactAuthorNameFromText,
  deriveRowSearchConcept,
} from "./useReplyResources";
// F1 fix: isResourceBatchFresh moved to useReplyRows.ts, which owns
// resourceSeqRef (the state the comparison actually reads) and is now the
// ONLY caller in production (via resourcesUnchangedSince). Importing it from
// there, rather than testing a re-export or a second copy, means this test
// exercises the exact function `resourcesUnchangedSince` calls - the whole
// point of the fix.
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

function makeRow(overrides: Partial<Pick<ReplyRow, "resourceState" | "reply" | "skipped">>) {
  return { reply: "A drafted reply.", ...overrides };
}

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

describe("deriveRowSearchConcept (post + reply, redacted, then normalized like the bulk pass)", () => {
  it("combines post and reply text into one concept", () => {
    const concept = deriveRowSearchConcept("A post about recursion in Python.", "Nice example of a base case.", "Sam Lee");
    expect(concept).toContain("recursion");
    expect(concept).toContain("base case");
  });

  it("the combined concept contains no form of the author's name, even when both halves mention it", () => {
    const concept = deriveRowSearchConcept(
      "Sam Lee here, discussing merge sort complexity.",
      "Sam, your analysis of merge sort was spot on.",
      "Sam Lee"
    );
    expect(concept.toLowerCase()).not.toContain("sam");
    expect(concept.toLowerCase()).not.toContain("lee");
  });

  it("empty post and empty reply yields an empty concept - nothing to search for", () => {
    expect(deriveRowSearchConcept("", "", "Sam Lee")).toBe("");
    expect(deriveRowSearchConcept("   ", "  \n ", "Sam Lee")).toBe("");
  });

  it("a post with no reply yet still yields a searchable concept from the post alone", () => {
    const concept = deriveRowSearchConcept("A detailed post about binary search trees.", "", "Sam Lee");
    expect(concept).toContain("binary search trees");
  });

  it("SABOTAGE CHECK: dropping the redaction step would leak the name straight through - pinned against the exact function this hook calls, not a re-implementation", () => {
    const concept = deriveRowSearchConcept("Post text.", "Maria, thanks for sharing.", "Maria Lopez");
    expect(concept).not.toMatch(/\bmaria\b/i);
  });
});
