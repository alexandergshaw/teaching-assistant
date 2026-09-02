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
// the right answer given a taken value" (covered above) - it is "does the
// one-shot take actually happen, from the correct place, exactly once".
//
// RESHAPE (structural-fix pass): the take moved OUT of useDiscussionReplies
// .ts's `start()` and INTO useDiscussionKnowledgeContext.ts's own live
// launch listener - a `window.addEventListener(RECORDING_LAUNCH_EVENT, ...)`
// registered once ([] deps), mirroring GradingRecordingPanel.tsx's own
// listener shape, so the carried context (and its label) can be shown
// BEFORE a run instead of only after Start is clicked. The guard here is
// the INVERSE of what it asserted before this pass: exactly one take call
// site, and it is now NOT inside start() - it is inside
// useDiscussionKnowledgeContext.ts's own effect. A future regression that
// matters just as much as the original ones this guard was built for: a
// leftover SECOND take call re-added to start() (someone "restoring" the
// old behaviour, or a new display read added carelessly) would silently
// starve the listener - the one-shot only ever pays out once, so whichever
// reader loses the race gets `null` forever after. That is exactly the "a
// later display read and start() now silently gets nothing" failure the
// count-based assertion below exists to catch.
//
// Reshaped three ways, kept together because each catches a different half
// of the failure mode (see this task's own report for every sabotage
// result):
//
//  1. POSITIVE, but exactly-once and NOT in start(): scans BOTH files this
//     one-shot could plausibly live in (this hook, and useDiscussionReplies
//     .ts), counts every real call-site ASSIGNMENT across them, and
//     separately confirms start()'s own useCallback body (bounded by its own
//     opening and its own closing `}, [...]);`, not the whole file) contains
//     none. A second call site anywhere - a leftover in start(), a stray
//     duplicate in the listener file, or a copy pasted into a third file
//     under this directory - fails the exact-one-total assertion; a call
//     inside start() specifically fails the second, independently of the
//     total.
//  2. POSITIVE, listener-shaped: the take that DOES exist sits inside a
//     `useEffect(() => { ... }, []);` whose body also registers a live
//     `window.addEventListener(RECORDING_LAUNCH_EVENT, ...)` - not merely
//     "some effect somewhere", which would equally match the OLD mount-only-
//     read defect this whole module exists to avoid (recording-launch.ts's
//     own header). A take sitting in an empty-dep effect with no listener
//     registration is exactly that defect wearing the new file's clothes.
//  3. NEGATIVE, narrower than the old blanket ban: an empty-dep-array
//     `useEffect(() => { ... }, []);` whose body is NOT a listener
//     registration (no `addEventListener` call in it) may never contain the
//     take. This still catches the original sabotage the old guard was
//     written for (a mount-only read with no live subscription), while no
//     longer flagging the CORRECT live-listener shape this pass introduces,
//     which the old blanket "no useEffect may contain the take" rule would
//     have wrongly failed.
//
// Not chosen: moving the decision into a pure function with its own
// executing test. That already happened for the DECISION half
// (resolveStartKnowledgeContext, tested above). What remains unguarded is
// not a decision at all - it is a side-effecting READ (a one-shot
// module-level drain) that means what it means only because of WHEN and
// WHERE it fires - exactly the kind of fact a pure function cannot express,
// per this test file's own "vitest here is node-env and renders no hook"
// constraint.
// ---------------------------------------------------------------------------

describe("the one-shot take lives in useDiscussionKnowledgeContext.ts's live launch listener, never in start() (GAP 2 source guard, reshaped)", () => {
  const readSource = (relPath: string): string => fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");

  const HOOK_PATH = "src/app/components/recording/useDiscussionKnowledgeContext.ts";
  const REPLIES_PATH = "src/app/components/recording/useDiscussionReplies.ts";

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

  // Matches every empty-dep-array useEffect block ("mount-once" shape,
  // including the correct live-listener registration - registering the
  // LISTENER once is fine; it is the listener callback that must react to
  // every dispatch, and does, since it is invoked fresh on each event).
  // The body group is built from a NEGATIVE LOOKAHEAD ((?:(?!\n  \}, \[)
  // [\s\S])*), not a bare lazy [\s\S]*?, specifically so this cannot cross
  // OVER an earlier effect's own close with different deps (e.g. the
  // knowledgeContext-mirror effect right above the listener, which closes
  // `}, [knowledgeContext]);`) while hunting for a `[]`-close further down
  // the file. A bare lazy match would silently merge two separate effects
  // into one "match" whenever the first one it meets does not have empty
  // deps - proven while building this guard: the naive version merged the
  // mirror effect and the listener effect into a single erroneous match
  // that still happened to contain both `takeRecordingKnowledgeContext(` and
  // `addEventListener(`, passing every assertion below for the wrong reason.
  const EMPTY_DEP_EFFECT_PATTERN = /useEffect\(\(\) => \{((?:(?!\n  \}, \[)[\s\S])*)\n  \}, \[\]\);/g;

  it("exactly ONE real call site (an assignment, `= takeRecordingKnowledgeContext()`) across the two files it could live in, and it is inside useDiscussionKnowledgeContext.ts, not useDiscussionReplies.ts", () => {
    const hookSrc = readSource(HOOK_PATH);
    const repliesSrc = readSource(REPLIES_PATH);
    // Deliberately an ASSIGNMENT pattern, not a bare occurrence count of the
    // name - both files' own doc comments name this function in prose too
    // (e.g. "calls takeRecordingKnowledgeContext()" with no leading `=`),
    // which must not count as a second call site.
    const callPattern = /=\s*takeRecordingKnowledgeContext\(\)/g;
    const inHook = hookSrc.match(callPattern) ?? [];
    const inReplies = repliesSrc.match(callPattern) ?? [];
    expect(inHook.length, "expected exactly one take call site in useDiscussionKnowledgeContext.ts").toBe(1);
    expect(inReplies.length, "expected NO take call site left in useDiscussionReplies.ts").toBe(0);
  });

  it("start()'s own useCallback body (useDiscussionReplies.ts) contains no takeRecordingKnowledgeContext call at all - the inverse of this guard's own pre-reshape assertion", () => {
    const src = readSource(REPLIES_PATH);
    const body = startBody(src);
    expect(body).not.toMatch(/takeRecordingKnowledgeContext/);
  });

  it("the take is threaded into resolveStartKnowledgeContext INSIDE useDiscussionKnowledgeContext.ts's own launch-listener effect, not discarded or reimplemented inline", () => {
    const src = readSource(HOOK_PATH);
    const effects = src.match(EMPTY_DEP_EFFECT_PATTERN) ?? [];
    const takeEffects = effects.filter((e) => /takeRecordingKnowledgeContext\(/.test(e));
    expect(takeEffects.length, "expected to find the launch-listener effect containing the take").toBe(1);
    expect(takeEffects[0]).toMatch(/resolveStartKnowledgeContext\(current,\s*taken\)/);
  });

  it("the take's effect is a real live-listener registration (contains window.addEventListener(RECORDING_LAUNCH_EVENT, ...)), never a bare mount-only read", () => {
    const src = readSource(HOOK_PATH);
    const effects = src.match(EMPTY_DEP_EFFECT_PATTERN) ?? [];
    expect(effects.length, "expected to find at least one useEffect block in this file - a check over nothing proves nothing").toBeGreaterThan(0);
    const takeEffects = effects.filter((e) => /takeRecordingKnowledgeContext\(/.test(e));
    expect(takeEffects.length).toBeGreaterThan(0);
    for (const effect of takeEffects) {
      expect(effect, "the effect containing the take must also register a live RECORDING_LAUNCH_EVENT listener").toMatch(
        /addEventListener\(RECORDING_LAUNCH_EVENT/
      );
    }
  });

  it("forbids the original defect's own shape, narrowed: an empty-dep useEffect whose body is NOT a listener registration may never contain the take", () => {
    const src = readSource(HOOK_PATH);
    const effects = src.match(EMPTY_DEP_EFFECT_PATTERN) ?? [];
    const nonListenerOffenders = effects.filter(
      (e) => /takeRecordingKnowledgeContext\(/.test(e) && !/addEventListener\(/.test(e)
    );
    expect(nonListenerOffenders, nonListenerOffenders.join("\n---\n")).toEqual([]);
  });

  it("SABOTAGE CHECK: fails if the take call is replaced with a hardcoded null inside the launch listener (the sibling wave's exact sabotage, relocated to the new home)", () => {
    // Verified by sabotage: temporarily edited useDiscussionKnowledgeContext
    // .ts's listener to read `const taken = null;` instead of `const taken =
    // takeRecordingKnowledgeContext();`, ran `npx vitest run
    // discussion-knowledge-context.test.ts`, confirmed this test (and the
    // "exactly ONE real call site" test above) went RED while the rest of
    // the baseline stayed green and `tsc --noEmit` stayed clean. Reverted,
    // re-ran green. See this task's own report for the confirmation.
    const src = readSource(HOOK_PATH);
    expect(src).not.toMatch(/const taken = null;/);
    expect(src).toMatch(/const taken = takeRecordingKnowledgeContext\(\);/);
  });

  it("SABOTAGE CHECK: fails if the take call is RELOCATED, verbatim, into an empty-dep effect that does NOT register a listener - a mount-only read wearing the new file's clothes", () => {
    // Verified by sabotage: temporarily removed the
    // `window.addEventListener(RECORDING_LAUNCH_EVENT, handler)` /
    // `return () => window.removeEventListener(...)` lines from the
    // listener effect in useDiscussionKnowledgeContext.ts, leaving the take
    // itself (and the handler function) in place inside the same `useEffect
    // (() => { ... }, []);` - i.e. a mount-only body that no longer
    // subscribes to anything. Ran `npx vitest run
    // discussion-knowledge-context.test.ts`: the "live-listener registration"
    // test above and this test's own assertion below both went RED, while a
    // hypothetical guard that only checked "is the take inside SOME
    // useEffect" would have stayed GREEN throughout, since the take is still
    // inside a `useEffect(..., [])` either way. Reverted, re-ran green. See
    // this task's own report for the confirmation.
    const src = readSource(HOOK_PATH);
    const effects = src.match(EMPTY_DEP_EFFECT_PATTERN) ?? [];
    const takeEffects = effects.filter((e) => /takeRecordingKnowledgeContext\(/.test(e));
    expect(takeEffects.length).toBeGreaterThan(0);
    for (const effect of takeEffects) {
      expect(effect).toMatch(/addEventListener\(RECORDING_LAUNCH_EVENT/);
    }
  });

  it("SABOTAGE CHECK: fails if a second take call is re-added inside start() alongside the (correct) listener take - the leftover-second-reader defect this reshape's own count guard exists to catch", () => {
    // Verified by sabotage: temporarily re-added `const taken =
    // takeRecordingKnowledgeContext();` inside start()'s body in
    // useDiscussionReplies.ts (leaving useDiscussionKnowledgeContext.ts's
    // own listener take untouched), ran `npx vitest run
    // discussion-knowledge-context.test.ts`: the "exactly ONE real call
    // site" test above and the "start()'s own useCallback body contains no
    // takeRecordingKnowledgeContext call at all" test both went RED (two
    // call sites total; one inside start()), while every purely-behavioural
    // test above (resolveStartKnowledgeContext, knowledgeContextLabelFor)
    // stayed green - proving those alone could never have caught this.
    // Reverted, re-ran green. See this task's own report for the
    // confirmation.
    const hookSrc = readSource(HOOK_PATH);
    const repliesSrc = readSource(REPLIES_PATH);
    const callPattern = /=\s*takeRecordingKnowledgeContext\(\)/g;
    const total = (hookSrc.match(callPattern) ?? []).length + (repliesSrc.match(callPattern) ?? []).length;
    expect(total).toBe(1);
    expect(startBody(repliesSrc)).not.toMatch(/takeRecordingKnowledgeContext/);
  });
});

// ---------------------------------------------------------------------------
// THE TRAP (task's own framing): the take moved out of start(), but the
// persisted-LABEL write must NOT move with it. Moving the write to launch
// time would let a launch that is never followed by a real capture leave a
// label behind - a later reload with this table's rows restored from that
// same (never-captured) session would then wrongly tell the instructor
// "earlier replies here used Knowledge Base context" when none ever were.
// Guarded the same way the take itself is: scoped to start()'s own
// useCallback body, not a file-wide string search (a file-wide search would
// equally "pass" if the write were moved into the launch listener alongside
// the take, since the string would still be somewhere in the file).
// ---------------------------------------------------------------------------

describe("the persisted-label write stays in start(), never moves to the launch listener", () => {
  const readSource = (relPath: string): string => fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
  const REPLIES_PATH = "src/app/components/recording/useDiscussionReplies.ts";
  const HOOK_PATH = "src/app/components/recording/useDiscussionKnowledgeContext.ts";
  const START_BODY_PATTERN = /const start = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/;

  function startBody(src: string): string {
    const match = src.match(START_BODY_PATTERN);
    expect(match, "expected to find start()'s own useCallback body in useDiscussionReplies.ts").toBeTruthy();
    return match![1];
  }

  it("start()'s own body writes the persisted label via writeLocalStorage(\"ta-rec-disc-kb-context-label\", ...)", () => {
    const body = startBody(readSource(REPLIES_PATH));
    expect(body).toMatch(/writeLocalStorage\(\s*\n?\s*"ta-rec-disc-kb-context-label"/);
  });

  it("the launch listener in useDiscussionKnowledgeContext.ts does NOT itself write the persisted label - only start() may", () => {
    const hookSrc = readSource(HOOK_PATH);
    // See EMPTY_DEP_EFFECT_PATTERN's own comment (above, in the earlier
    // describe block) for why this is a negative-lookahead body group, not a
    // bare lazy [\s\S]*? - the latter can silently merge this file's earlier
    // knowledgeContext-mirror effect (a different, non-empty deps array)
    // into the same "match" as the listener effect below it.
    const effectPattern = /useEffect\(\(\) => \{((?:(?!\n  \}, \[)[\s\S])*)\n  \}, \[\]\);/g;
    const effects = hookSrc.match(effectPattern) ?? [];
    const takeEffects = effects.filter((e) => /takeRecordingKnowledgeContext\(/.test(e));
    expect(takeEffects.length).toBeGreaterThan(0);
    for (const effect of takeEffects) {
      expect(effect, "the launch-listener effect must not itself write the persisted label").not.toMatch(
        /writeLocalStorage/
      );
    }
  });

  it("SABOTAGE CHECK: fails if the label write is moved out of start() into the launch listener (the trap this task's own brief called out)", () => {
    // Verified by sabotage: temporarily moved the
    // `writeLocalStorage("ta-rec-disc-kb-context-label", ...)` call out of
    // start() in useDiscussionReplies.ts and into
    // useDiscussionKnowledgeContext.ts's own launch-listener effect
    // (immediately after the `setKnowledgeContext` call, inside the `if
    // (taken)` guard) - i.e. exactly the trap: writing the label at launch
    // arrival instead of at an actual Start click. Ran `npx vitest run
    // discussion-knowledge-context.test.ts`: this test's own two assertions
    // below went RED (the write disappeared from start()'s body; the
    // listener effect gained a writeLocalStorage call), while every purely-
    // behavioural test in this file (resolveStartKnowledgeContext,
    // knowledgeContextLabelFor, and the take-location guards above, which
    // don't care about the label at all) stayed green - proving none of
    // those could have caught this on their own. Reverted, re-ran green. See
    // this task's own report for the confirmation.
    const repliesBody = startBody(readSource(REPLIES_PATH));
    expect(repliesBody).toMatch(/writeLocalStorage\(\s*\n?\s*"ta-rec-disc-kb-context-label"/);
    const hookSrc = readSource(HOOK_PATH);
    // See EMPTY_DEP_EFFECT_PATTERN's own comment (above, in the earlier
    // describe block) for why this is a negative-lookahead body group, not a
    // bare lazy [\s\S]*? - the latter can silently merge this file's earlier
    // knowledgeContext-mirror effect (a different, non-empty deps array)
    // into the same "match" as the listener effect below it.
    const effectPattern = /useEffect\(\(\) => \{((?:(?!\n  \}, \[)[\s\S])*)\n  \}, \[\]\);/g;
    const effects = hookSrc.match(effectPattern) ?? [];
    const takeEffects = effects.filter((e) => /takeRecordingKnowledgeContext\(/.test(e));
    for (const effect of takeEffects) {
      expect(effect).not.toMatch(/writeLocalStorage/);
    }
  });
});

// ---------------------------------------------------------------------------
// DiscussionRepliesPanel.tsx's own render: "if nothing is carried, render
// nothing - never an empty 'Knowledge Base context:' with no value." This
// repo's vitest is node-env and renders no component (AGENTS.md's own
// constraint, restated at the top of this file's earlier guard section), so
// this is a source-text guard on the JSX conditional itself, not a rendered-
// DOM assertion - the same class of check this file already uses for the
// take's location.
// ---------------------------------------------------------------------------

describe("DiscussionRepliesPanel.tsx renders the carried-context line only when knowledgeContextLabel is truthy", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/components/recording/DiscussionRepliesPanel.tsx"),
    "utf-8"
  );

  it("the carried-context paragraph is gated on `knowledgeContextLabel &&`, not rendered unconditionally", () => {
    expect(src).toMatch(/\{knowledgeContextLabel\s*&&\s*\(/);
  });

  it("the carried-context paragraph's own text interpolates knowledgeContextLabel (so a truthy render always carries a real value, never a bare label)", () => {
    const match = src.match(/\{knowledgeContextLabel\s*&&\s*\(([\s\S]*?)\)\}/);
    expect(match, "expected to find the gated carried-context paragraph").toBeTruthy();
    expect(match![1]).toMatch(/\$\{knowledgeContextLabel\}/);
  });

  it("SABOTAGE CHECK: fails if the gate is removed, rendering the line unconditionally", () => {
    // Verified by sabotage: temporarily changed
    // `{knowledgeContextLabel && (<p ...>...</p>)}` to an unconditional
    // `<p ...>...</p>` (no gate at all) in DiscussionRepliesPanel.tsx, ran
    // `npx vitest run discussion-knowledge-context.test.ts`, confirmed the
    // "gated on knowledgeContextLabel &&" test above went RED. Reverted,
    // re-ran green. See this task's own report for the confirmation.
    expect(src).toMatch(/\{knowledgeContextLabel\s*&&\s*\(/);
  });
});
