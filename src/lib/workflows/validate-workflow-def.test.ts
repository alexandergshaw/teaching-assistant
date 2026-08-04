// TDD for CHUNK A of the Course Build cleanup. These tests were written from the
// acceptance criteria BEFORE the implementation existed; they currently fail.
// Make them pass without changing what they assert.
//
// The defect class under test, proven by experiment before this file was written:
// inserting one step into COURSE_REFRESH silently grew Course Build's run form from
// 29 fields to 37, silently dropped two bindOverrides, and produced no compile error
// and no runtime error. types.expand.ts reaches that outcome through four separate
// silent-fallback branches (:141-143, :165-167, :186-189, :69-72).
//
// The validator is a REPORTER. It never throws and never mutates. Expansion stays
// lenient at run time; this is the build-time gate.
import { describe, it, expect } from "vitest";
import {
  validateWorkflowDef,
  resolveIncludeKeyTargets,
  type WorkflowDefIssue,
  type StepShape,
} from "@/lib/workflows/validate-workflow-def";
import type { WorkflowDef } from "@/lib/workflows/types";

// Minimal step shapes. The validator must not need the real registry - it takes a
// lookup so it stays free of any import that could reach next/headers.
const SHAPES: Record<string, StepShape> = {
  "load-tile": { inputs: [{ key: "hubCourse" }], outputs: [{ key: "course" }, { key: "description" }] },
  "make-schedule": { inputs: [{ key: "description" }], outputs: [{ key: "schedule" }, { key: "weeks" }] },
  "use-schedule": { inputs: [{ key: "schedule" }, { key: "selected" }], outputs: [{ key: "files" }] },
  "no-outputs": { inputs: [{ key: "repo" }], outputs: [] },
  // Declares `selected` exactly like use-schedule does. Its whole purpose is to be
  // indistinguishable from the real target to an input-key-existence guard.
  decoy: { inputs: [{ key: "selected" }, { key: "schedule" }], outputs: [{ key: "files" }] },
};

const lookupShape = (type: string): StepShape | undefined => SHAPES[type];

function codes(issues: WorkflowDefIssue[]): string[] {
  return issues.map((i) => i.code).sort();
}

function def(steps: WorkflowDef["steps"], id = "wf"): WorkflowDef {
  return { id, name: id, description: "", steps };
}

describe("validateWorkflowDef - AC A1: pure reporter", () => {
  it("returns an empty array for a clean workflow", () => {
    const clean = def([
      { type: "load-tile", bindings: { hubCourse: { source: "runtime", fieldKey: "hubCourse" } } },
      {
        type: "make-schedule",
        bindings: { description: { source: "step", stepIndex: 0, outputKey: "description" } },
      },
    ]);
    expect(validateWorkflowDef(clean, { lookupShape, lookupWorkflow: () => undefined })).toEqual([]);
  });

  it("never throws on a badly malformed definition", () => {
    const broken = def([
      { type: "does-not-exist", bindings: { x: { source: "step", stepIndex: 99, outputKey: "nope" } } },
      { type: "include-workflow", bindings: {}, include: { workflowId: "missing", skipSteps: [7], remap: {} } },
    ]);
    expect(() =>
      validateWorkflowDef(broken, { lookupShape, lookupWorkflow: () => undefined })
    ).not.toThrow();
    expect(validateWorkflowDef(broken, { lookupShape, lookupWorkflow: () => undefined }).length).toBeGreaterThan(0);
  });
});

describe("validateWorkflowDef - AC A2: every silent path gets a distinct code", () => {
  it("unknown-step-type", () => {
    const d = def([{ type: "nope", bindings: {} }]);
    expect(codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: () => undefined }))).toContain(
      "unknown-step-type"
    );
  });

  it("step-binding-out-of-range", () => {
    const d = def([
      { type: "load-tile", bindings: {} },
      { type: "make-schedule", bindings: { description: { source: "step", stepIndex: 5, outputKey: "description" } } },
    ]);
    expect(codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: () => undefined }))).toContain(
      "step-binding-out-of-range"
    );
  });

  it("step-binding-forward-reference: a step may not read its own or a later step's output", () => {
    const d = def([
      { type: "make-schedule", bindings: { description: { source: "step", stepIndex: 1, outputKey: "description" } } },
      { type: "load-tile", bindings: {} },
    ]);
    expect(codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: () => undefined }))).toContain(
      "step-binding-forward-reference"
    );
  });

  it("step-binding-unknown-output: the target step declares no such output key", () => {
    const d = def([
      { type: "load-tile", bindings: {} },
      { type: "make-schedule", bindings: { description: { source: "step", stepIndex: 0, outputKey: "nonesuch" } } },
    ]);
    expect(codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: () => undefined }))).toContain(
      "step-binding-unknown-output"
    );
  });

  // server-runner.ts:317 iterates stepDef.inputs, so a binding written for an input the
  // step does not declare is silently discarded at run time. That is a real authoring
  // bug (a typo'd input key does nothing) and must be reported.
  it("binding-key-not-an-input", () => {
    const d = def([
      { type: "load-tile", bindings: { hubCourse: { source: "runtime", fieldKey: "h" }, typo: { source: "literal", value: "1" } } },
    ]);
    expect(codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: () => undefined }))).toContain(
      "binding-key-not-an-input"
    );
  });

  it("include-unknown-workflow", () => {
    const d = def([{ type: "include-workflow", bindings: {}, include: { workflowId: "ghost", skipSteps: [], remap: {} } }]);
    expect(codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: () => undefined }))).toContain(
      "include-unknown-workflow"
    );
  });

  it("include-skip-out-of-range", () => {
    const source = def([{ type: "load-tile", bindings: {} }], "src");
    const d = def([{ type: "include-workflow", bindings: {}, include: { workflowId: "src", skipSteps: [4], remap: {} } }]);
    expect(
      codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: (id) => (id === "src" ? source : undefined) }))
    ).toContain("include-skip-out-of-range");
  });

  it("remap-key-not-a-dropped-step: a remap key naming a step that was NOT skipped", () => {
    const source = def(
      [
        { type: "load-tile", bindings: {} },
        { type: "make-schedule", bindings: { description: { source: "step", stepIndex: 0, outputKey: "description" } } },
      ],
      "src"
    );
    const d = def([
      {
        type: "include-workflow",
        bindings: {},
        // step 1 is not in skipSteps, so "1.schedule" can never match anything
        include: { workflowId: "src", skipSteps: [0], remap: { "1.schedule": { source: "literal", value: "" } } },
      },
    ]);
    expect(
      codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: (id) => (id === "src" ? source : undefined) }))
    ).toContain("remap-key-not-a-dropped-step");
  });

  it("remap-key-unknown-output: the dropped step declares no such output", () => {
    const source = def([{ type: "load-tile", bindings: {} }], "src");
    const d = def([
      {
        type: "include-workflow",
        bindings: {},
        include: { workflowId: "src", skipSteps: [0], remap: { "0.nonesuch": { source: "literal", value: "" } } },
      },
    ]);
    expect(
      codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: (id) => (id === "src" ? source : undefined) }))
    ).toContain("remap-key-unknown-output");
  });

  it("override-key-no-such-step: bindOverrides key names an index the source does not have", () => {
    const source = def([{ type: "load-tile", bindings: {} }], "src");
    const d = def([
      {
        type: "include-workflow",
        bindings: {},
        include: {
          workflowId: "src",
          skipSteps: [],
          remap: {},
          bindOverrides: { "9.hubCourse": { source: "literal", value: "x" } },
        },
      },
    ]);
    expect(
      codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: (id) => (id === "src" ? source : undefined) }))
    ).toContain("override-key-no-such-step");
  });

  it("override-key-not-an-input: the targeted step does not declare that input", () => {
    const source = def([{ type: "load-tile", bindings: {} }], "src");
    const d = def([
      {
        type: "include-workflow",
        bindings: {},
        include: {
          workflowId: "src",
          skipSteps: [],
          remap: {},
          bindOverrides: { "0.notAnInput": { source: "literal", value: "x" } },
        },
      },
    ]);
    expect(
      codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: (id) => (id === "src" ? source : undefined) }))
    ).toContain("override-key-not-an-input");
  });

  // types.expand.ts:186-189 drops the gate and runs the step UNCONDITIONALLY.
  it("runif-target-dropped: a gate pointing at a skipped step", () => {
    const source = def(
      [
        { type: "load-tile", bindings: {} },
        {
          type: "no-outputs",
          bindings: { repo: { source: "literal", value: "" } },
          runIf: { binding: { source: "step", stepIndex: 0, outputKey: "course" }, expected: true },
        },
      ],
      "src"
    );
    const d = def([
      { type: "include-workflow", bindings: {}, include: { workflowId: "src", skipSteps: [0], remap: {} } },
    ]);
    expect(
      codes(validateWorkflowDef(d, { lookupShape, lookupWorkflow: (id) => (id === "src" ? source : undefined) }))
    ).toContain("runif-target-dropped");
  });
});

describe("resolveIncludeKeyTargets - AC A3: the identity check the existing guard lacks", () => {
  // The existing guard (presets.course-build.test.ts:110-138) asserts only that "N.key"
  // names a step DECLARING an input called `key`. In the real experiment, inserting a
  // step at COURSE_REFRESH index 6 left "6.courseKind" and "6.selected" UNREPORTED,
  // because the newly-shifted-in step happened to declare those same inputs.
  // Resolving each key to its target step TYPE is what catches that.
  const source = def(
    [
      { type: "load-tile", bindings: {} },
      { type: "use-schedule", bindings: { schedule: { source: "runtime", fieldKey: "s" } } },
    ],
    "src"
  );

  const including = def([
    {
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "src",
        skipSteps: [],
        remap: {},
        bindOverrides: { "1.selected": { source: "literal", value: "1" } },
      },
    },
  ]);

  it("reports the resolved target step type for every dotted key", () => {
    const targets = resolveIncludeKeyTargets(including, {
      lookupShape,
      lookupWorkflow: (id) => (id === "src" ? source : undefined),
    });
    expect(targets).toContainEqual(
      expect.objectContaining({ key: "1.selected", kind: "bindOverride", targetTypes: ["use-schedule"] })
    );
  });

  // THE experiment, reduced to a unit test. A step is inserted at index 1, pushing
  // `use-schedule` to index 2. The inserted step ALSO declares a `selected` input, so
  // the existing input-key-existence guard stays green while "1.selected" now lands on
  // a completely different step. Resolving to the target TYPE is what makes it red.
  it("the resolved target CHANGES when a step is inserted ahead of it, even when the inserted step declares the same input", () => {
    const shifted = def(
      [
        { type: "load-tile", bindings: {} },
        { type: "decoy", bindings: {} },
        { type: "use-schedule", bindings: { schedule: { source: "runtime", fieldKey: "s" } } },
      ],
      "src"
    );
    const opts = (w: WorkflowDef) => ({ lookupShape, lookupWorkflow: () => w });

    const before = resolveIncludeKeyTargets(including, opts(source)).find((t) => t.key === "1.selected");
    const after = resolveIncludeKeyTargets(including, opts(shifted)).find((t) => t.key === "1.selected");

    expect(before?.targetTypes).toEqual(["use-schedule"]);
    expect(after?.targetTypes).toEqual(["decoy"]);
    // The point of the whole check: the key silently changed meaning.
    expect(after?.targetTypes).not.toEqual(before?.targetTypes);

    // ...and the old-style guard would NOT have caught it, because `decoy` declares
    // `selected` too. Proven here so nobody "simplifies" this back to an input check.
    expect(SHAPES.decoy.inputs.some((i) => i.key === "selected")).toBe(true);
    expect(SHAPES["use-schedule"].inputs.some((i) => i.key === "selected")).toBe(true);
  });

  // An include key targeting a step that is ITSELF an include (COURSE_BUILD's "18.*"
  // targets STARTER_MATERIALS' include) fans out to every absorbed step. It works today
  // only because STARTER_MATERIALS has exactly one step; a second would silently apply
  // both overrides to both steps.
  it("fans out to every absorbed step when the target is itself an include", () => {
    const inner = def([{ type: "use-schedule", bindings: {} }, { type: "no-outputs", bindings: {} }], "inner");
    const outer = def(
      [
        { type: "load-tile", bindings: {} },
        { type: "include-workflow", bindings: {}, include: { workflowId: "inner", skipSteps: [], remap: {} } },
      ],
      "outer"
    );
    const top = def([
      {
        type: "include-workflow",
        bindings: {},
        include: {
          workflowId: "outer",
          skipSteps: [],
          remap: {},
          bindOverrides: { "1.selected": { source: "literal", value: "1" } },
        },
      },
    ]);
    const targets = resolveIncludeKeyTargets(top, {
      lookupShape,
      lookupWorkflow: (id) => (id === "outer" ? outer : id === "inner" ? inner : undefined),
    });
    const entry = targets.find((t) => t.key === "1.selected");
    expect(entry?.targetTypes).toEqual(["use-schedule", "no-outputs"]);
  });
});
