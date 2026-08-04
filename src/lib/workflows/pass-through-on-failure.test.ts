// Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure,
// registry-helpers.ts). Historically this file cross-checked TWO
// independently-maintained copies of this logic - server-runner.ts's own
// resolvePassThroughOutputs/isRunOk (the unattended run loop) and
// useWorkflowRun.ts's own identically-named resolvePassThroughOutputs/
// isGroupGenuineFailure (the attended/browser run loop) - against each other
// AND against an explicit expected value, so a scenario where both were
// equally wrong would still fail.
//
// THAT IS NO LONGER WHAT THIS FILE TESTS. A refactor (run-step-core.ts, D2)
// has since consolidated both copies into exactly ONE shared implementation:
// server-runner.ts's resolvePassThroughOutputs/isRunOk and useWorkflowRun.ts's
// resolvePassThroughOutputs are now the SAME function object, re-exported
// through two different modules - and useWorkflowRun.ts's isGroupGenuineFailure
// is now a trivial `!isRunOk(...)` wrapper around that one shared algorithm.
// Comparing "server" against "attended" below is therefore comparing a
// function to itself (`f(x) === f(x)`): it can never fail, no matter how
// wrong the shared implementation becomes. The assertions are kept anyway (a
// cheap smoke test that both re-export chains still resolve to something
// callable), but they carry none of this file's original weight.
//
// The real content now lives in the ORACLE section below: a frozen,
// hand-copied snapshot of the two algorithms as they existed at git HEAD
// (commit 2419cec), the last point before the run-step-core.ts consolidation
// (an uncommitted working-tree change as of this writing - see
// run-step-core.ts's own D2 header). Production is asserted against that
// frozen oracle, not just against its own re-exports, which is what lets this
// file catch a real regression again even though there is now only one
// production implementation to break. See the ORACLE section's own comment
// for why these must never be refactored to call production code.
//
// This is also still the only coverage useWorkflowRun.ts's own re-exported
// copy of this logic gets at all: this repo's vitest config only picks up
// "*.test.ts" under a "node" environment (vitest.config.ts) - no jsdom, no
// React Testing Library - so the hook itself cannot be rendered or driven
// end-to-end the way presets.course-build.resilience.test.ts drives the
// unattended runner. Both resolvePassThroughOutputs re-exports are plain,
// closure-free exported functions specifically so they are importable and
// testable here without that infrastructure.

import { describe, it, expect } from "vitest";
import { resolvePassThroughOutputs as resolveServer, isRunOk } from "./server-runner";
import { resolvePassThroughOutputs as resolveAttended, isGroupGenuineFailure } from "@/app/components/workflows/useWorkflowRun";
import { stepBindingIndex, type InputBinding } from "./types";

const STEP = (stepIndex: number, outputKey: string): InputBinding => ({ source: "step", stepIndex, outputKey });
const RUNTIME = (fieldKey: string): InputBinding => ({ source: "runtime", fieldKey });
const LITERAL = (value: string): InputBinding => ({ source: "literal", value });

// ---------------------------------------------------------------------------
// FROZEN HISTORICAL ORACLE - hand-copied, verbatim, from git HEAD (commit
// 2419cec) - src/lib/workflows/server-runner.ts (resolvePassThroughOutputs
// ~:131-157, isRunOk ~:489-499) and
// src/app/components/workflows/useWorkflowRun.pass-through.ts
// (isGroupGenuineFailure ~:71-81). That commit is the last point where these
// were two genuinely independent, hand-maintained algorithms, before an
// uncommitted working-tree refactor (run-step-core.ts) collapsed them into
// one shared implementation each.
//
// resolvePassThroughOutputs was already byte-identical between the two
// files at HEAD (both copies are reproduced as the one function below,
// since there is nothing to tell apart). isRunOk and isGroupGenuineFailure
// were NOT identical: isRunOk computed an actual set difference
// (failedSteps minus disabled minus skipped); isGroupGenuineFailure computed
// a cardinality comparison (failedSteps.size > disabled.size + skipped.size)
// that only agrees with the set difference while disabledRunIndices and
// skippedRunIndices are always DISJOINT SUBSETS of failedSteps - true of
// every real call site (a step index is added to failedSteps in the exact
// same branch that adds it to exactly one of those two sets - see
// server-runner.ts's `failedSteps.add(i); (gate === "disabled" ?
// disabledRunIndices : skippedRunIndices).add(i);`) but not a property
// either algorithm actually checked. See the dedicated disagreement test
// below for a manufactured input where that invariant does not hold and the
// two verdicts genuinely diverge.
//
// DO NOT refactor any function in this block to call production code (e.g.
// run-step-core.ts), import a shared helper, or otherwise "deduplicate" it
// against the implementations above. The entire point of this block is that
// it is FROZEN: production can be restructured again and again, and these
// three functions must keep behaving exactly as they did the day the two
// run loops were still independently maintained. Silently emptying THIS
// oracle the same way the production consolidation emptied the parity
// checks above would defeat the whole file a second time.
// ---------------------------------------------------------------------------

function oracleResolvePassThroughOutputs(
  passThroughOnFailure: Record<string, string> | undefined,
  bindings: Record<string, InputBinding>,
  failedSteps: ReadonlySet<number>,
  stepOutputs: ReadonlyArray<Record<string, unknown> | undefined>
): { passedThrough: boolean; outputs: Record<string, unknown> } {
  const outputs: Record<string, unknown> = {};
  let passedThrough = false;
  if (!passThroughOnFailure) {
    return { passedThrough, outputs };
  }
  for (const [outputKey, inputKey] of Object.entries(passThroughOnFailure)) {
    const binding = bindings[inputKey];
    if (!binding || binding.source !== "step") continue;
    // This oracle models an already-EXPANDED def (server-runner.ts and
    // useWorkflowRun.ts both only ever see bindings expandWorkflowDef has
    // already lowered) - a residual stepId here would mean the expander
    // failed to lower it, which is a bug this oracle should surface loudly
    // rather than silently reinterpret.
    const stepIdx = stepBindingIndex(binding);
    if (stepIdx === undefined) {
      throw new Error(
        `oracle: "${inputKey}" is bound by stepId, but this oracle only models already-expanded (stepIndex-only) defs.`
      );
    }
    // The step this input binds to must itself have genuinely succeeded (or
    // itself passed through - a passed-through step is deliberately never
    // added to failedSteps, which is exactly what makes ITS OWN output
    // resolvable here) - never salvage a value out of a step that never
    // actually produced one.
    if (failedSteps.has(stepIdx)) continue;
    const value = stepOutputs[stepIdx]?.[binding.outputKey];
    if (value === undefined) continue;
    outputs[outputKey] = value;
    passedThrough = true;
  }
  return { passedThrough, outputs };
}

// HEAD server-runner.ts's own isRunOk: an actual set difference.
function oracleIsRunOk(
  failedSteps: ReadonlySet<number>,
  disabledRunIndices: ReadonlySet<number>,
  skippedRunIndices: ReadonlySet<number>,
  passThroughFailures: ReadonlySet<number>
): boolean {
  const genuineFailures = [...failedSteps].filter(
    (i) => !disabledRunIndices.has(i) && !skippedRunIndices.has(i)
  );
  return genuineFailures.length === 0 && passThroughFailures.size === 0;
}

// HEAD useWorkflowRun.pass-through.ts's own isGroupGenuineFailure: a
// cardinality comparison, NOT a set difference - see the block comment
// above for exactly when this stops agreeing with oracleIsRunOk.
function oracleIsGroupGenuineFailure(
  failedSteps: ReadonlySet<number>,
  disabledRunIndices: ReadonlySet<number>,
  skippedRunIndices: ReadonlySet<number>,
  passThroughFailures: ReadonlySet<number>
): boolean {
  return (
    failedSteps.size > disabledRunIndices.size + skippedRunIndices.size ||
    passThroughFailures.size > 0
  );
}

interface Fixture {
  name: string;
  passThroughOnFailure: Record<string, string> | undefined;
  bindings: Record<string, InputBinding>;
  failedSteps: Set<number>;
  stepOutputs: Array<Record<string, unknown> | undefined>;
  expected: { passedThrough: boolean; outputs: Record<string, unknown> };
}

const FIXTURES: Fixture[] = [
  {
    // AC (Scope section): "a step that does not declare the field takes
    // today's path byte-for-byte" - the field being entirely absent must
    // never pass through anything, no matter what the bindings/outputs look
    // like.
    name: "a step NOT declaring passThroughOnFailure behaves exactly as today (never passes through)",
    passThroughOnFailure: undefined,
    bindings: { files: STEP(0, "files") },
    failedSteps: new Set(),
    stepOutputs: [{ files: ["a"] }],
    expected: { passedThrough: false, outputs: {} },
  },
  {
    name: "declared, but the mapped input has no binding at all",
    passThroughOnFailure: { files: "files" },
    bindings: {},
    failedSteps: new Set(),
    stepOutputs: [{ files: ["a"] }],
    expected: { passedThrough: false, outputs: {} },
  },
  {
    name: "declared, but the mapped input's binding is runtime (not step) - nothing upstream to salvage",
    passThroughOnFailure: { files: "files" },
    bindings: { files: RUNTIME("someField") },
    failedSteps: new Set(),
    stepOutputs: [],
    expected: { passedThrough: false, outputs: {} },
  },
  {
    name: "declared, but the mapped input's binding is literal (not step) - nothing upstream to salvage",
    passThroughOnFailure: { files: "files" },
    bindings: { files: LITERAL("50") },
    failedSteps: new Set(),
    stepOutputs: [],
    expected: { passedThrough: false, outputs: {} },
  },
  {
    name: "declared, binding points at a step that itself genuinely failed - cannot salvage a value that was never produced",
    passThroughOnFailure: { files: "files" },
    bindings: { files: STEP(2, "files") },
    failedSteps: new Set([2]),
    stepOutputs: [undefined, undefined, { files: ["x"] }],
    expected: { passedThrough: false, outputs: {} },
  },
  {
    name: "declared, binding resolves to a step that ran but never produced that exact output key",
    passThroughOnFailure: { files: "files" },
    bindings: { files: STEP(0, "files") },
    failedSteps: new Set(),
    stepOutputs: [{ otherKey: "y" }],
    expected: { passedThrough: false, outputs: {} },
  },
  {
    // The ordinary case: a mid-chain generator throws, its "files" input is
    // bound to the immediately preceding (genuinely successful) generator.
    name: "declared, binding resolves to a genuinely successful step - passes the value through",
    passThroughOnFailure: { files: "files" },
    bindings: { files: STEP(0, "files") },
    failedSteps: new Set(),
    stepOutputs: [{ files: ["a", "b"] }],
    expected: { passedThrough: true, outputs: { files: ["a", "b"] } },
  },
  {
    // Two consecutive generators fail: the SECOND one's "files" binding
    // points at the FIRST one, which itself passed through (so it is not in
    // failedSteps, and its own stepOutputs entry already holds the salvaged
    // value) - the salvage must cascade forward, not stop at the first
    // recovery.
    name: "declared, binding resolves to a step that itself passed through - the salvage cascades",
    passThroughOnFailure: { files: "files" },
    bindings: { files: STEP(1, "files") },
    failedSteps: new Set(),
    stepOutputs: [undefined, { files: ["only-original"] }],
    expected: { passedThrough: true, outputs: { files: ["only-original"] } },
  },
  {
    // An empty array is still a DEFINED value (not undefined) - a
    // generator that received nothing yet (e.g. the second chain generator,
    // if the first produced no files at all) must still pass that empty
    // list through rather than treating it as "nothing to salvage".
    name: "declared, the upstream value is an empty array (defined, falsy) - still passes through",
    passThroughOnFailure: { files: "files" },
    bindings: { files: STEP(0, "files") },
    failedSteps: new Set(),
    stepOutputs: [{ files: [] }],
    expected: { passedThrough: true, outputs: { files: [] } },
  },
  {
    // Multiple mapped output keys, mixed outcome: one resolves normally, the
    // other's binding points at a failed step. Only the resolvable one ships.
    name: "declared with two output keys - one resolves, the other (bound to a failed step) does not",
    passThroughOnFailure: { files: "files", rubric: "rubricSource" },
    bindings: {
      files: STEP(0, "files"),
      rubricSource: STEP(3, "rubric"),
    },
    failedSteps: new Set([3]),
    stepOutputs: [{ files: ["a"] }, undefined, undefined, undefined],
    expected: { passedThrough: true, outputs: { files: ["a"] } },
  },
];

describe("deliverable-resilience pass-through: attended/unattended parity", () => {
  for (const f of FIXTURES) {
    it(f.name, () => {
      const server = resolveServer(f.passThroughOnFailure, f.bindings, f.failedSteps, f.stepOutputs);
      const attended = resolveAttended(f.passThroughOnFailure, f.bindings, f.failedSteps, f.stepOutputs);
      const oracle = oracleResolvePassThroughOutputs(f.passThroughOnFailure, f.bindings, f.failedSteps, f.stepOutputs);
      // Each re-export must match the explicit expected value (not just each
      // other - two implementations agreeing on the WRONG answer would
      // otherwise pass).
      expect(server).toEqual(f.expected);
      expect(attended).toEqual(f.expected);
      // server and attended are now the SAME function object (see header) -
      // this can never fail on its own, kept only as a smoke test that both
      // re-export chains still resolve.
      expect(server).toEqual(attended);
      // THE REAL CHECK: production cross-checked against a frozen historical
      // oracle that is never refactored to call production code. This is
      // what still gives this file teeth now that "server === attended" is
      // trivially true.
      expect(oracle).toEqual(f.expected);
      expect(server).toEqual(oracle);
    });
  }
});

describe("deliverable-resilience: isRunOk / isGroupGenuineFailure parity", () => {
  // isRunOk (server-runner.ts) answers "is the run clean"; isGroupGenuineFailure
  // (useWorkflowRun.ts) answers the inverted question "did the group genuinely
  // fail" - each loop's own natural phrasing for its own return shape (see
  // each function's own doc comment). For identical inputs the two must
  // always be exact logical opposites - trivially true today since
  // isGroupGenuineFailure is now literally `!isRunOk(...)` (run-step-core.ts),
  // so the real pin is each case's oracleIsRunOk comparison below.
  const CASES: Array<{
    name: string;
    failedSteps: Set<number>;
    disabledRunIndices: Set<number>;
    skippedRunIndices: Set<number>;
    passThroughFailures: Set<number>;
    expectOk: boolean;
  }> = [
    {
      name: "nothing failed, nothing disabled, nothing skipped, nothing passed through - clean",
      failedSteps: new Set(),
      disabledRunIndices: new Set(),
      skippedRunIndices: new Set(),
      passThroughFailures: new Set(),
      expectOk: true,
    },
    {
      name: "a step genuinely failed (no pass-through) - not ok",
      failedSteps: new Set([2]),
      disabledRunIndices: new Set(),
      skippedRunIndices: new Set(),
      passThroughFailures: new Set(),
      expectOk: false,
    },
    {
      name: "the only failedSteps entry is a disabled step - still ok",
      failedSteps: new Set([2]),
      disabledRunIndices: new Set([2]),
      skippedRunIndices: new Set(),
      passThroughFailures: new Set(),
      expectOk: true,
    },
    {
      name: "the only failedSteps entry is a gate-skipped step - still ok",
      failedSteps: new Set([2]),
      disabledRunIndices: new Set(),
      skippedRunIndices: new Set([2]),
      passThroughFailures: new Set(),
      expectOk: true,
    },
    {
      // The central claim this whole feature exists to prove: a pass-through
      // step is NEVER in failedSteps (that is what stops the cascade), so
      // without passThroughFailures being checked on its own, this case
      // would incorrectly report ok - "resilience must never become
      // silence".
      name: "a generator passed through a failure (not in failedSteps at all) - still not ok",
      failedSteps: new Set(),
      disabledRunIndices: new Set(),
      skippedRunIndices: new Set(),
      passThroughFailures: new Set([5]),
      expectOk: false,
    },
    {
      name: "a genuine failure AND an unrelated disabled step AND a pass-through, all at once - not ok",
      failedSteps: new Set([1, 2, 3]),
      disabledRunIndices: new Set([2]),
      skippedRunIndices: new Set(),
      passThroughFailures: new Set([7]),
      expectOk: false,
    },
  ];

  for (const c of CASES) {
    it(c.name, () => {
      const ok = isRunOk(c.failedSteps, c.disabledRunIndices, c.skippedRunIndices, c.passThroughFailures);
      const genuineFailure = isGroupGenuineFailure(c.failedSteps, c.disabledRunIndices, c.skippedRunIndices, c.passThroughFailures);
      expect(ok).toBe(c.expectOk);
      expect(genuineFailure).toBe(!c.expectOk);
      // Exact logical opposites for identical inputs, every time.
      expect(ok).toBe(!genuineFailure);
      // Pin production's isRunOk against the frozen historical set-difference
      // oracle - every case here respects the real-call-site invariant
      // (disabledRunIndices/skippedRunIndices are disjoint subsets of
      // failedSteps), so the set-difference and cardinality oracles both
      // agree with c.expectOk too (see the dedicated test below for a case
      // where that invariant does not hold and they stop agreeing).
      expect(ok).toBe(oracleIsRunOk(c.failedSteps, c.disabledRunIndices, c.skippedRunIndices, c.passThroughFailures));
      expect(ok).toBe(!oracleIsGroupGenuineFailure(c.failedSteps, c.disabledRunIndices, c.skippedRunIndices, c.passThroughFailures));
    });
  }

  // The real content the cardinality-vs-set-difference difference was hiding.
  // oracleIsRunOk (set difference) and oracleIsGroupGenuineFailure
  // (cardinality) only ever agreed because every REAL call site adds a step
  // index to failedSteps in the exact same branch that adds it to exactly
  // one of disabledRunIndices/skippedRunIndices (see the ORACLE section's own
  // comment) - so disabledRunIndices/skippedRunIndices were always disjoint
  // subsets of failedSteps in practice. Neither algorithm actually checks
  // that invariant. This input breaks it on purpose: failedSteps contains an
  // index (2) that is in neither disabledRunIndices nor skippedRunIndices
  // (a genuine, un-excused failure) - and, vice versa, disabledRunIndices
  // contains an index (5) that is NOT in failedSteps at all (a disabled step
  // wholly unrelated to the failure). The unrelated disabled entry pads the
  // cardinality comparison's right-hand side enough to cancel out the one
  // genuine failure on the left, so the proxy silently reports "not a
  // genuine failure" - exactly wrong.
  it("HEAD's two verdict functions could disagree when disabled/skipped is not a subset of failedSteps - the real content the cardinality-vs-set-difference difference was hiding", () => {
    const failedSteps = new Set([2]);
    const disabledRunIndices = new Set([5]);
    const skippedRunIndices = new Set<number>();
    const passThroughFailures = new Set<number>();

    // Set difference (correct): step 2 is a genuine failure - nothing
    // excuses it - so the run is NOT ok.
    expect(oracleIsRunOk(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures)).toBe(false);

    // Cardinality (the historical proxy): 1 failed step vs 1 disabled + 0
    // skipped - the sizes are equal, so it reports "not a genuine failure"
    // (i.e. ok) even though the failure at step 2 has nothing to do with the
    // disabled step at index 5.
    expect(oracleIsGroupGenuineFailure(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures)).toBe(false);

    // If the two were always exact logical opposites (as both functions'
    // own doc comments at HEAD claimed), oracleIsRunOk would equal
    // !oracleIsGroupGenuineFailure. Here it does not: they disagree.
    expect(oracleIsRunOk(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures)).not.toBe(
      !oracleIsGroupGenuineFailure(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures)
    );

    // Today's production (run-step-core.ts's single shared isRunOk, the
    // correct set-difference algorithm) gets this right, matching the
    // set-difference oracle rather than the buggy cardinality one.
    const ok = isRunOk(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures);
    const genuineFailure = isGroupGenuineFailure(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures);
    expect(ok).toBe(false);
    expect(genuineFailure).toBe(true);
  });
});
