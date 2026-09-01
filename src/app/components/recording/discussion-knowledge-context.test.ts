// Unit tests for the pure discussion-knowledge-context module (GAP 2 fix -
// see that file's own header for the untested hop this exists to close).
//
// This file imports no helper from any sibling *.test.ts - that re-runs the
// sibling's describe blocks - and duplicates any fixture it needs, per this
// repo's own rule.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { resolveStartKnowledgeContext, knowledgeContextLabelFor } from "./discussion-knowledge-context";

// ---------------------------------------------------------------------------
// resolveStartKnowledgeContext: "given whether a run is already active, and
// the pending context, what context does this run use." Every scenario below
// is a frozen literal oracle, not a comparison against a second
// implementation (this repo's "Refactors disarm tests" rule).
// ---------------------------------------------------------------------------

describe("resolveStartKnowledgeContext", () => {
  it("a fresh table's first Start, no launch pending: null in, null out - an ordinary run", () => {
    expect(resolveStartKnowledgeContext(null, null)).toBeNull();
  });

  it("a fresh table's first Start, a real launch precedes it: the taken context is used", () => {
    const taken = { text: "Selected page: Policy", label: "1 Knowledge Base page" };
    expect(resolveStartKnowledgeContext(null, taken)).toBe(taken); // same reference, not a clone
  });

  it("Stop, then Start again with NO new launch in between: taken is null (the one-shot already drained) - the EXISTING context is preserved, not cleared", () => {
    const current = { text: "Selected page: Policy", label: "1 Knowledge Base page" };
    expect(resolveStartKnowledgeContext(current, null)).toBe(current);
  });

  it("Stop, then Start again WITH a new launch (different pages selected this time): the new taken context replaces the old one", () => {
    const current = { text: "Selected page: Policy", label: "1 Knowledge Base page" };
    const taken = { text: "Selected page: Grading rubric", label: "1 Knowledge Base page" };
    expect(resolveStartKnowledgeContext(current, taken)).toBe(taken);
  });

  it("SABOTAGE CHECK: fails if the function is inverted to prefer `current` over `taken` (current ?? taken)", () => {
    const current = { text: "stale" };
    const taken = { text: "fresh" };
    // Verified by sabotage: temporarily changed the implementation's `taken
    // ?? current` to `current ?? taken`, ran `npx vitest run
    // discussion-knowledge-context.test.ts`, confirmed this assertion (and
    // the "new launch... replaces" case above) went RED, then reverted and
    // re-ran green. See this feature's own report for the confirmation.
    expect(resolveStartKnowledgeContext(current, taken)).toBe(taken);
  });
});

// ---------------------------------------------------------------------------
// knowledgeContextLabelFor
// ---------------------------------------------------------------------------

describe("knowledgeContextLabelFor", () => {
  it("returns null when there is no context", () => {
    expect(knowledgeContextLabelFor(null)).toBeNull();
  });

  it("returns the context's own label when present", () => {
    expect(knowledgeContextLabelFor({ label: "3 Knowledge Base pages" })).toBe("3 Knowledge Base pages");
  });

  it("falls back to a generic label when the context carries none (a launch with usable text but no label)", () => {
    expect(knowledgeContextLabelFor({})).toBe("Knowledge Base pages");
  });
});

// ---------------------------------------------------------------------------
// Source guard (mirrors discussion-table-view.test.ts's rawRows guard and
// recording-split.structure.test.ts's own readFileSync idiom): the hop this
// whole file exists for is NOT "does resolveStartKnowledgeContext compute
// the right answer given a taken value" (covered above) - it is "does
// start() actually call takeRecordingKnowledgeContext() at all". A sibling
// wave sabotaged exactly that call (replaced it with a hardcoded `null`)
// and every behavioural test above would stay GREEN under that sabotage,
// because a genuinely-empty take (nothing was ever launched) and a
// permanently-nulled take are indistinguishable from resolveStartKnowledge
// Context's own point of view - both just look like "taken is null". vitest
// here is node-env and renders no hook, so there is no way to observe the
// real call firing except by pinning the STRUCTURE of the call site itself,
// the same discipline the rawRows guard already uses for an identical class
// of gap.
// ---------------------------------------------------------------------------

describe("useDiscussionReplies.ts's start() actually calls takeRecordingKnowledgeContext() (GAP 2 source guard)", () => {
  const readSource = (relPath: string): string => fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");

  it("start() assigns `taken` from a real call to takeRecordingKnowledgeContext(), not a literal", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    expect(src).toMatch(/const taken = takeRecordingKnowledgeContext\(\);/);
    // Exactly one call site (an ASSIGNMENT, `= takeRecordingKnowledgeContext
    // ()`) in the whole file - the "take exactly once per run" contract
    // (discussion-knowledge-context.ts's own header) depends on there being
    // no second place this one-shot is drained. Deliberately narrower than a
    // bare occurrence count of the name: the file's own doc comments name
    // this function in prose too (e.g. "from takeRecordingKnowledgeContext()"
    // with no leading `=`), which must not count as a second call site.
    const calls = src.match(/=\s*takeRecordingKnowledgeContext\(\)/g) ?? [];
    expect(calls.length).toBe(1);
  });

  it("the taken value is actually threaded into resolveStartKnowledgeContext, not discarded or reimplemented inline", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    expect(src).toMatch(/resolveStartKnowledgeContext\(knowledgeContextRef\.current,\s*taken\)/);
  });

  it("SABOTAGE CHECK: fails if the take call is replaced with a hardcoded null (the sibling wave's exact sabotage)", () => {
    // Verified by sabotage: temporarily edited useDiscussionReplies.ts's
    // start() to read `const taken = null;` instead of `const taken =
    // takeRecordingKnowledgeContext();`, ran `npx vitest run
    // discussion-knowledge-context.test.ts`, confirmed THIS test (and the
    // "assigns `taken` from a real call" test above) went RED while every
    // other test in the 751-file/15580-test baseline stayed green and `tsc
    // --noEmit` stayed clean - exactly reproducing what the report says the
    // sibling's sabotage did to the suite before this guard existed. Then
    // reverted and re-ran green. See this feature's own report.
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    expect(src).not.toMatch(/const taken = null;/);
    expect(src).toMatch(/const taken = takeRecordingKnowledgeContext\(\);/);
  });
});
