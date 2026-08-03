// Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure,
// registry-helpers.ts) is implemented TWICE, once per run loop:
// server-runner.ts's own resolvePassThroughOutputs/isRunOk (the unattended
// run loop, already exercised end-to-end by
// presets.course-build.resilience.test.ts) and useWorkflowRun.ts's own
// identically-named resolvePassThroughOutputs/isGroupGenuineFailure (the
// attended/browser run loop). The two loops deliberately share no code
// (server-runner.ts must stay free of client-only/DOM code; useWorkflowRun.ts
// is "use client" and pulls in browser/Supabase-backed hooks that cannot run
// headless) - see each function's own doc comment for that reasoning.
//
// That means the two implementations can silently drift apart with nobody
// noticing until an attended run and an unattended run of the SAME workflow
// disagree on whether a mid-chain generator failure cascades. This file is
// what actually catches that: every fixture below is run through BOTH
// implementations and asserted equal to each other AND to an explicit
// expected value (so a scenario where both are equally wrong still fails).
//
// This is also the only coverage useWorkflowRun.ts's own copy of this logic
// gets at all: this repo's vitest config only picks up "*.test.ts" under a
// "node" environment (vitest.config.ts) - no jsdom, no React Testing
// Library - so the hook itself cannot be rendered or driven end-to-end the
// way presets.course-build.resilience.test.ts drives the unattended runner.
// Both resolvePassThroughOutputs functions are plain, closure-free exported
// functions specifically so they are importable and testable here without
// that infrastructure - see each one's own doc comment.

import { describe, it, expect } from "vitest";
import { resolvePassThroughOutputs as resolveServer, isRunOk } from "./server-runner";
import { resolvePassThroughOutputs as resolveAttended, isGroupGenuineFailure } from "@/app/components/workflows/useWorkflowRun";
import type { InputBinding } from "./types";

const STEP = (stepIndex: number, outputKey: string): InputBinding => ({ source: "step", stepIndex, outputKey });
const RUNTIME = (fieldKey: string): InputBinding => ({ source: "runtime", fieldKey });
const LITERAL = (value: string): InputBinding => ({ source: "literal", value });

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
      // Each loop's own implementation must match the explicit expected
      // value (not just each other - two implementations agreeing on the
      // WRONG answer would otherwise pass).
      expect(server).toEqual(f.expected);
      expect(attended).toEqual(f.expected);
      // And, directly, the two independent implementations must never diverge.
      expect(server).toEqual(attended);
    });
  }
});

describe("deliverable-resilience: isRunOk / isGroupGenuineFailure parity", () => {
  // isRunOk (server-runner.ts) answers "is the run clean"; isGroupGenuineFailure
  // (useWorkflowRun.ts) answers the inverted question "did the group genuinely
  // fail" - each loop's own natural phrasing for its own return shape (see
  // each function's own doc comment). For identical inputs the two must
  // always be exact logical opposites.
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
    });
  }
});
