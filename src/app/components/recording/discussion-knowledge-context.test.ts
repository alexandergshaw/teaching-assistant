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
// start() actually call takeRecordingKnowledgeContext() at all, FROM INSIDE
// start() ITSELF". A sibling wave sabotaged the first half of that (replaced
// the call with a hardcoded `null`) and every behavioural test above would
// stay GREEN under that sabotage, because a genuinely-empty take (nothing
// was ever launched) and a permanently-nulled take are indistinguishable
// from resolveStartKnowledgeContext's own point of view - both just look
// like "taken is null".
//
// RESHAPE (this pass): the original guard here was a bare, file-wide,
// POSITIVE regex - `src` (the WHOLE file's text) matched against
// `/const taken = takeRecordingKnowledgeContext\(\);/`, with no regard to
// WHERE in the file that text sat. That blocked a legitimate extraction (an
// agent splitting this 990-line hook could not move any of start()'s
// session-action siblings without the pin's line-count/position shifting)
// while still PERMITTING the exact defect it exists to catch: relocating
// that identical line into a mount-only `useEffect(() => { ... }, []);` -
// so the take fires once on mount instead of once per Start click - passes
// a file-wide regex exactly as well as the correct placement does, because
// the string is merely somewhere in the file either way.
//
// Reshaped two ways, kept together because each catches a different half of
// the same defect (see this task's own report for both sabotage results):
//
//  1. POSITIVE, but SCOPED: start()'s own useCallback body is extracted
//     (bounded by its own opening and its own closing `}, [...]);`, not the
//     whole file), and the take call plus the resolveStartKnowledgeContext
//     call it feeds must sit INSIDE that extracted body. A relocation now
//     fails here directly - the text is simply absent from the thing being
//     scanned - without needing to predict in advance what shape a future
//     relocation takes.
//  2. NEGATIVE, forbidding the defect's own shape: no `useEffect(...)` block
//     anywhere in the file may contain the take call. Redundant with (1) for
//     the sabotage actually reproduced below (moving the call INTO an effect
//     necessarily moves it OUT of start()'s body, so (1) alone already goes
//     red), but it names the forbidden shape directly, and would still catch
//     a future variant where the call is copied into an effect while the
//     original is left behind in start() - a shape (1) alone could miss.
//
// Not chosen: moving the decision into a pure function with its own
// executing test. That already happened for the DECISION half
// (resolveStartKnowledgeContext, tested above) when this file was written.
// What remains unguarded is not a decision at all - it is a side-effecting
// READ (a one-shot module-level drain) that means what it means only
// because of WHEN it fires, relative to a user's Start click rather than
// relative to mount - exactly the kind of fact a pure function cannot
// express, per this test file's own "vitest here is node-env and renders no
// hook" constraint.
// ---------------------------------------------------------------------------

describe("useDiscussionReplies.ts's start() actually calls takeRecordingKnowledgeContext() (GAP 2 source guard)", () => {
  const readSource = (relPath: string): string => fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");

  // Bounded to start()'s own useCallback body - not the whole file - by
  // matching from its declaration up to ITS OWN closing `}, [...]);` (the
  // useCallback's deps-array close, at the same 2-space indent as the
  // opening `const start =` line). A relocation anywhere else in the file
  // falls outside this capture group entirely.
  const START_BODY_PATTERN = /const start = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/;

  function startBody(src: string): string {
    const match = src.match(START_BODY_PATTERN);
    expect(match, "expected to find start()'s own useCallback body in useDiscussionReplies.ts").toBeTruthy();
    return match![1];
  }

  it("start() assigns `taken` from a real call to takeRecordingKnowledgeContext(), FROM INSIDE start()'s own body", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    const body = startBody(src);
    expect(body).toMatch(/const taken = takeRecordingKnowledgeContext\(\);/);
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

  it("the taken value is actually threaded into resolveStartKnowledgeContext, INSIDE start()'s own body, not discarded or reimplemented inline", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    const body = startBody(src);
    expect(body).toMatch(/resolveStartKnowledgeContext\(knowledgeContextRef\.current,\s*taken\)/);
  });

  it("forbids the defect's own shape: no useEffect(...) block anywhere in the file may contain the take call - the take is a response to a user's Start click, never a mount-time side effect", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    const effectPattern = /useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/g;
    const effects = src.match(effectPattern) ?? [];
    expect(effects.length, "expected to find at least one useEffect block in this file - a check over nothing proves nothing").toBeGreaterThan(0);
    const offenders = effects.filter((effect) => /takeRecordingKnowledgeContext\(/.test(effect));
    expect(offenders, offenders.join("\n---\n")).toEqual([]);
  });

  it("SABOTAGE CHECK: fails if the take call is replaced with a hardcoded null inside start() (the sibling wave's exact sabotage)", () => {
    // Verified by sabotage: temporarily edited useDiscussionReplies.ts's
    // start() to read `const taken = null;` instead of `const taken =
    // takeRecordingKnowledgeContext();`, ran `npx vitest run
    // discussion-knowledge-context.test.ts`, confirmed this test (and the
    // "assigns `taken` from a real call" test above) went RED while the rest
    // of the baseline stayed green and `tsc --noEmit` stayed clean - exactly
    // reproducing what the report says the sibling's sabotage did to the
    // suite before this guard existed. Then reverted and re-ran green. See
    // this task's own report for the confirmation.
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    const body = startBody(src);
    expect(body).not.toMatch(/const taken = null;/);
    expect(body).toMatch(/const taken = takeRecordingKnowledgeContext\(\);/);
  });

  it("SABOTAGE CHECK: fails if the take call is RELOCATED, verbatim, out of start() and into a mount-only useEffect - the gap this reshape exists to close", () => {
    // Verified by sabotage: temporarily moved the exact line `const taken =
    // takeRecordingKnowledgeContext();` (and the `if (taken) { ... }` block
    // that follows it) out of start()'s body and into a new
    // `useEffect(() => { ... }, []);` placed alongside this file's other
    // mount-time effects, leaving start() itself calling neither
    // takeRecordingKnowledgeContext() nor resolveStartKnowledgeContext(). Ran
    // `npx vitest run discussion-knowledge-context.test.ts`: this test, the
    // "assigns `taken`" test, the "threaded into resolveStartKnowledgeContext"
    // test, and the "forbids the defect's own shape" test above all went RED
    // together, while the OLD, unreshaped guard (a bare file-wide positive
    // regex) would have stayed GREEN throughout, since the relocated line is
    // still present in the file, just not inside start(). Then reverted and
    // re-ran green. See this task's own report for the confirmation.
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    const body = startBody(src);
    expect(body).toMatch(/const taken = takeRecordingKnowledgeContext\(\);/);
    const effectPattern = /useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/g;
    const effects = src.match(effectPattern) ?? [];
    const offenders = effects.filter((effect) => /takeRecordingKnowledgeContext\(/.test(effect));
    expect(offenders).toEqual([]);
  });
});
