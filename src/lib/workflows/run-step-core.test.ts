// Unit tests for the shared per-step execution core (D1/D9). Before this
// module existed, the attended engine's copy of this logic lived only inside
// a React hook (useWorkflowRun.ts), and this repo's vitest has no jsdom - so
// it had never had an executable test. Extracting the decision logic into
// this dependency-free module is what makes it directly testable, on behalf
// of BOTH engines at once (since both now call the exact same functions).

import { describe, it, expect } from "vitest";
import {
  evaluateStepGate,
  resolveStepInputs,
  resolvePassThroughOutputs,
  isRunOk,
  enabledRuntimeFields,
  type StepRunOutcome,
} from "./run-step-core";
import type { StepDefinition } from "./registry";
import type { WorkflowStepConfig, WorkflowDef, InputBinding, RuntimeField } from "./types";

const STEP = (stepIndex: number, outputKey: string): InputBinding => ({ source: "step", stepIndex, outputKey });
const RUNTIME = (fieldKey: string): InputBinding => ({ source: "runtime", fieldKey });
const LITERAL = (value: string): InputBinding => ({ source: "literal", value });

function makeStepDef(type: string, inputs: StepDefinition["inputs"] = []): StepDefinition {
  return {
    type,
    name: type,
    description: "",
    inputs,
    outputs: [],
    run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
  };
}

describe("resolveStepInputs", () => {
  it("resolves runtime, step-output, and literal bindings", async () => {
    const def = makeStepDef("a", [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "count", label: "Count", type: "text", required: false },
      { key: "suffix", label: "Suffix", type: "text", required: false },
    ]);
    const step: WorkflowStepConfig = {
      type: "a",
      bindings: {
        name: RUNTIME("who"),
        count: STEP(0, "n"),
        suffix: LITERAL("!"),
      },
    };
    const target: Record<string, unknown> = {};
    await resolveStepInputs(
      {
        step,
        stepDef: def,
        scope: undefined,
        fieldValues: { who: "World" },
        uploadFiles: {},
        failedSteps: new Set(),
        stepOutputs: [{ n: 3 }],
        expandedSteps: [step],
        expandedTopIndices: [0],
        disabledTopIndices: new Set(),
        stepLookup: () => def,
        activeInstitution: null,
      },
      target
    );
    expect(target).toEqual({ name: "World", count: 3, suffix: "!" });
  });

  it("throws 'Missing output from step N' when the bound step index is out of range", async () => {
    const def = makeStepDef("consumer", [{ key: "v", label: "V", type: "text", required: true }]);
    const step: WorkflowStepConfig = { type: "consumer", bindings: { v: STEP(5, "out") } };
    await expect(
      resolveStepInputs(
        {
          step,
          stepDef: def,
          scope: undefined,
          fieldValues: {},
          uploadFiles: {},
          failedSteps: new Set(),
          stepOutputs: [], // index 5 does not exist at all
          expandedSteps: [step],
          expandedTopIndices: [0],
          disabledTopIndices: new Set(),
          stepLookup: () => def,
          activeInstitution: null,
        },
        {}
      )
    ).rejects.toThrow("Missing output from step 6.");
  });

  it("throws 'Missing output from step N' when the bound step ran but never produced that output key (unknown output key)", async () => {
    const def = makeStepDef("consumer", [{ key: "v", label: "V", type: "text", required: true }]);
    const step: WorkflowStepConfig = { type: "consumer", bindings: { v: STEP(0, "missingKey") } };
    await expect(
      resolveStepInputs(
        {
          step,
          stepDef: def,
          scope: undefined,
          fieldValues: {},
          uploadFiles: {},
          failedSteps: new Set(),
          stepOutputs: [{ otherKey: "y" }],
          expandedSteps: [step],
          expandedTopIndices: [0],
          disabledTopIndices: new Set(),
          stepLookup: () => def,
          activeInstitution: null,
        },
        {}
      )
    ).rejects.toThrow("Missing output from step 1.");
  });

  it("throws '...which failed' for a binding to a genuinely-failed (not disabled) step", async () => {
    const producer = makeStepDef("producer");
    const def = makeStepDef("consumer", [{ key: "v", label: "V", type: "text", required: true }]);
    const producerStep: WorkflowStepConfig = { type: "producer", bindings: {} };
    const step: WorkflowStepConfig = { type: "consumer", bindings: { v: STEP(0, "out") } };
    await expect(
      resolveStepInputs(
        {
          step,
          stepDef: def,
          scope: undefined,
          fieldValues: {},
          uploadFiles: {},
          failedSteps: new Set([0]),
          stepOutputs: [],
          expandedSteps: [producerStep, step],
          expandedTopIndices: [0, 1],
          disabledTopIndices: new Set(), // step 0 is NOT disabled - a genuine failure
          stepLookup: () => producer,
          activeInstitution: null,
        },
        {}
      )
    ).rejects.toThrow('Skipped - depends on step 1 ("producer"), which failed.');
  });

  it("throws '...which is disabled' for a binding to a disabled step (skipped step)", async () => {
    // The skip cascade (evaluateStepGate) already pre-filters a binding to a
    // GATE-SKIPPED step before resolveStepInputs is ever called - only a
    // DISABLED dependency reaches this branch (see server-runner.test.ts's
    // "cascade-skips a step that depends on a disabled step").
    const producer = makeStepDef("producer");
    const def = makeStepDef("consumer", [{ key: "v", label: "V", type: "text", required: true }]);
    const producerStep: WorkflowStepConfig = { type: "producer", bindings: {} };
    const step: WorkflowStepConfig = { type: "consumer", bindings: { v: STEP(0, "out") } };
    await expect(
      resolveStepInputs(
        {
          step,
          stepDef: def,
          scope: undefined,
          fieldValues: {},
          uploadFiles: {},
          failedSteps: new Set([0]),
          stepOutputs: [],
          expandedSteps: [producerStep, step],
          expandedTopIndices: [0, 1],
          disabledTopIndices: new Set([0]), // step 0's top index IS disabled
          stepLookup: () => producer,
          activeInstitution: null,
        },
        {}
      )
    ).rejects.toThrow('Skipped - depends on step 1 ("producer"), which is disabled.');
  });

  it("fills an unbound input from the workflow scope when the scope covers its family", async () => {
    const def = makeStepDef("moduleStep", [{ key: "modulesAhead", label: "Modules ahead", type: "moduleOffset", required: false }]);
    const step: WorkflowStepConfig = { type: "moduleStep", bindings: {} };
    const target: Record<string, unknown> = {};
    await resolveStepInputs(
      {
        step,
        stepDef: def,
        scope: { moduleOffset: "2" },
        fieldValues: {},
        uploadFiles: {},
        failedSteps: new Set(),
        stepOutputs: [],
        expandedSteps: [step],
        expandedTopIndices: [0],
        disabledTopIndices: new Set(),
        stepLookup: () => def,
        activeInstitution: null,
      },
      target
    );
    expect(target.modulesAhead).toBe("2");
  });

  it("leaves an unbound, scope-uncovered input unresolved", async () => {
    const def = makeStepDef("textStep", [{ key: "topic", label: "Topic", type: "text", required: false }]);
    const step: WorkflowStepConfig = { type: "textStep", bindings: {} };
    const target: Record<string, unknown> = {};
    await resolveStepInputs(
      {
        step,
        stepDef: def,
        scope: undefined,
        fieldValues: {},
        uploadFiles: {},
        failedSteps: new Set(),
        stepOutputs: [],
        expandedSteps: [step],
        expandedTopIndices: [0],
        disabledTopIndices: new Set(),
        stepLookup: () => def,
        activeInstitution: null,
      },
      target
    );
    expect(target.topic).toBeUndefined();
  });

  it("throws 'Unknown step type' when stepDef is undefined", async () => {
    const step: WorkflowStepConfig = { type: "ghost", bindings: {} };
    await expect(
      resolveStepInputs(
        {
          step,
          stepDef: undefined,
          scope: undefined,
          fieldValues: {},
          uploadFiles: {},
          failedSteps: new Set(),
          stepOutputs: [],
          expandedSteps: [step],
          expandedTopIndices: [0],
          disabledTopIndices: new Set(),
          stepLookup: () => undefined,
          activeInstitution: null,
        },
        {}
      )
    ).rejects.toThrow('Unknown step type "ghost".');
  });

  describe("D5: the uploads predicate keys off spec.type, never a separately-looked-up RuntimeField", () => {
    const def = makeStepDef("needsFiles", [{ key: "files", label: "Files", type: "uploads", required: false }]);
    const step: WorkflowStepConfig = { type: "needsFiles", bindings: { files: RUNTIME("upload") } };

    it("resolves to the uploaded array when one is present", async () => {
      const target: Record<string, unknown> = {};
      await resolveStepInputs(
        {
          step, stepDef: def, scope: undefined, fieldValues: {},
          uploadFiles: { upload: ["file-a", "file-b"] },
          failedSteps: new Set(), stepOutputs: [], expandedSteps: [step], expandedTopIndices: [0],
          disabledTopIndices: new Set(), stepLookup: () => def, activeInstitution: null,
        },
        target
      );
      expect(target.files).toEqual(["file-a", "file-b"]);
    });

    it("resolves to [] (never a string) for a stale/missing binding - this is the exact old bug: 'field?.type === \"uploads\"' fell through to the string branch when no matching RuntimeField existed", async () => {
      const target: Record<string, unknown> = {};
      await resolveStepInputs(
        {
          step, stepDef: def, scope: undefined, fieldValues: {},
          // No entry for "upload" at all - the stale-binding scenario D5
          // describes (a workflow authored before a preset override dropped
          // the field). spec.type is still "uploads" (from stepDef.inputs,
          // always present), so this must still resolve to [], not "".
          uploadFiles: {},
          failedSteps: new Set(), stepOutputs: [], expandedSteps: [step], expandedTopIndices: [0],
          disabledTopIndices: new Set(), stepLookup: () => def, activeInstitution: null,
        },
        target
      );
      expect(target.files).toEqual([]);
      expect(typeof target.files).not.toBe("string");
    });
  });

  describe("D4: a hidden (visibleWhen-gated) runtime field resolves as empty, not its stored value", () => {
    const def = makeStepDef("gated", [
      { key: "sourceKind", label: "Source", type: "text", required: false },
      { key: "repoUrl", label: "Repo", type: "text", required: false, visibleWhen: { fieldKey: "sourceKind", equals: "repo" } },
      { key: "files", label: "Files", type: "uploads", required: false, visibleWhen: { fieldKey: "sourceKind", equals: "upload" } },
    ]);
    const step: WorkflowStepConfig = {
      type: "gated",
      bindings: { sourceKind: RUNTIME("sourceKind"), repoUrl: RUNTIME("repoUrl"), files: RUNTIME("uploadField") },
    };

    it("suppresses a hidden text field to ''", async () => {
      const target: Record<string, unknown> = {};
      await resolveStepInputs(
        {
          step, stepDef: def, scope: undefined,
          fieldValues: { sourceKind: "upload", repoUrl: "https://stale-value-from-earlier-choice" },
          uploadFiles: {},
          failedSteps: new Set(), stepOutputs: [], expandedSteps: [step], expandedTopIndices: [0],
          disabledTopIndices: new Set(), stepLookup: () => def, activeInstitution: null,
        },
        target
      );
      // sourceKind is "upload", not "repo" - repoUrl's visibleWhen is not
      // satisfied, so its stale stored value must never reach the step.
      expect(target.repoUrl).toBe("");
    });

    it("suppresses a hidden uploads field to []", async () => {
      const target: Record<string, unknown> = {};
      await resolveStepInputs(
        {
          step, stepDef: def, scope: undefined,
          fieldValues: { sourceKind: "repo" },
          uploadFiles: { uploadField: ["stale-upload"] },
          failedSteps: new Set(), stepOutputs: [], expandedSteps: [step], expandedTopIndices: [0],
          disabledTopIndices: new Set(), stepLookup: () => def, activeInstitution: null,
        },
        target
      );
      // sourceKind is "repo", not "upload" - files' visibleWhen is not
      // satisfied, so a stale uploadFiles entry must never reach the step.
      expect(target.files).toEqual([]);
    });

    it("resolves the currently-visible field normally", async () => {
      const target: Record<string, unknown> = {};
      await resolveStepInputs(
        {
          step, stepDef: def, scope: undefined,
          fieldValues: { sourceKind: "repo", repoUrl: "https://example.test/repo" },
          uploadFiles: {},
          failedSteps: new Set(), stepOutputs: [], expandedSteps: [step], expandedTopIndices: [0],
          disabledTopIndices: new Set(), stepLookup: () => def, activeInstitution: null,
        },
        target
      );
      expect(target.repoUrl).toBe("https://example.test/repo");
    });
  });
});

describe("evaluateStepGate", () => {
  it("returns 'disabled' when the step's top index is disabled", () => {
    const step: WorkflowStepConfig = { type: "a", bindings: {} };
    const action = evaluateStepGate({
      step,
      topIndex: 3,
      disabledTopIndices: new Set([3]),
      failedSteps: new Set(),
      skippedRunIndices: new Set(),
      stepOutputs: [],
      fieldValues: {},
      runtimeFields: [],
    });
    expect(action).toBe("disabled");
  });

  it("returns 'run' when nothing gates the step", () => {
    const step: WorkflowStepConfig = { type: "a", bindings: {} };
    const action = evaluateStepGate({
      step,
      topIndex: 0,
      disabledTopIndices: new Set(),
      failedSteps: new Set(),
      skippedRunIndices: new Set(),
      stepOutputs: [],
      fieldValues: {},
      runtimeFields: [],
    });
    expect(action).toBe("run");
  });

  describe("the runIf gate", () => {
    it("skips when a literal condition does not match `expected`", () => {
      const step: WorkflowStepConfig = { type: "a", bindings: {}, runIf: { binding: LITERAL("false"), expected: true } };
      expect(
        evaluateStepGate({ step, topIndex: 0, disabledTopIndices: new Set(), failedSteps: new Set(), skippedRunIndices: new Set(), stepOutputs: [], fieldValues: {}, runtimeFields: [] })
      ).toBe("skipped");
    });

    it("runs when a literal condition matches `expected`", () => {
      const step: WorkflowStepConfig = { type: "a", bindings: {}, runIf: { binding: LITERAL("true"), expected: true } };
      expect(
        evaluateStepGate({ step, topIndex: 0, disabledTopIndices: new Set(), failedSteps: new Set(), skippedRunIndices: new Set(), stepOutputs: [], fieldValues: {}, runtimeFields: [] })
      ).toBe("run");
    });

    it("treats a condition bound to an already-failed step as gate-unavailable (skipped)", () => {
      const step: WorkflowStepConfig = { type: "a", bindings: {}, runIf: { binding: STEP(0, "enabled"), expected: true } };
      expect(
        evaluateStepGate({ step, topIndex: 1, disabledTopIndices: new Set(), failedSteps: new Set([0]), skippedRunIndices: new Set(), stepOutputs: [], fieldValues: {}, runtimeFields: [] })
      ).toBe("skipped");
    });

    it("D4: a runIf condition bound to a CURRENTLY HIDDEN runtime field reads as empty, not its stale stored value", () => {
      const runtimeFields: RuntimeField[] = [
        { fieldKey: "source", label: "Source", type: "text", required: false },
        { fieldKey: "publish", label: "Publish?", type: "text", required: false, visibleWhen: { fieldKey: "source", equals: "manual" } },
      ];
      const step: WorkflowStepConfig = {
        type: "a",
        bindings: {},
        runIf: { binding: RUNTIME("publish"), expected: true },
      };
      // "publish" is only visible when source === "manual"; here source is
      // "auto", so publish is hidden - its stale stored value "true" (left
      // over from when it WAS visible) must not gate the step on.
      const action = evaluateStepGate({
        step, topIndex: 0, disabledTopIndices: new Set(), failedSteps: new Set(), skippedRunIndices: new Set(),
        stepOutputs: [], fieldValues: { source: "auto", publish: "true" }, runtimeFields,
      });
      expect(action).toBe("skipped");
    });

    it("D4: the SAME runtime field, when visible, is read normally", () => {
      const runtimeFields: RuntimeField[] = [
        { fieldKey: "source", label: "Source", type: "text", required: false },
        { fieldKey: "publish", label: "Publish?", type: "text", required: false, visibleWhen: { fieldKey: "source", equals: "manual" } },
      ];
      const step: WorkflowStepConfig = {
        type: "a",
        bindings: {},
        runIf: { binding: RUNTIME("publish"), expected: true },
      };
      const action = evaluateStepGate({
        step, topIndex: 0, disabledTopIndices: new Set(), failedSteps: new Set(), skippedRunIndices: new Set(),
        stepOutputs: [], fieldValues: { source: "manual", publish: "true" }, runtimeFields,
      });
      expect(action).toBe("run");
    });
  });

  describe("the transitive skip cascade", () => {
    it("skips a step directly bound to an already-skipped step", () => {
      const step: WorkflowStepConfig = { type: "b", bindings: { v: STEP(0, "out") } };
      expect(
        evaluateStepGate({ step, topIndex: 1, disabledTopIndices: new Set(), failedSteps: new Set([0]), skippedRunIndices: new Set([0]), stepOutputs: [], fieldValues: {}, runtimeFields: [] })
      ).toBe("skipped");
    });

    it("cascades TRANSITIVELY across a 3-step chain (A gate-skipped -> B depends on A -> C depends on B)", () => {
      // Step 0 (A): gated off outright.
      const stepA: WorkflowStepConfig = { type: "a", bindings: {}, runIf: { binding: LITERAL("false"), expected: true } };
      // Step 1 (B): depends on A's output.
      const stepB: WorkflowStepConfig = { type: "b", bindings: { v: STEP(0, "out") } };
      // Step 2 (C): depends on B's output - two hops removed from the
      // original gate, never itself gated or bound directly to A.
      const stepC: WorkflowStepConfig = { type: "c", bindings: { v: STEP(1, "out") } };

      const failedSteps = new Set<number>();
      const skippedRunIndices = new Set<number>();
      const disabledTopIndices = new Set<number>();
      const stepOutputs: Array<Record<string, unknown> | undefined> = [];
      const topIndices = [0, 1, 2];
      const steps = [stepA, stepB, stepC];
      const actions: string[] = [];

      for (let i = 0; i < steps.length; i++) {
        const action = evaluateStepGate({
          step: steps[i],
          topIndex: topIndices[i],
          disabledTopIndices,
          failedSteps,
          skippedRunIndices,
          stepOutputs,
          fieldValues: {},
          runtimeFields: [],
        });
        actions.push(action);
        if (action === "skipped") {
          failedSteps.add(i);
          skippedRunIndices.add(i);
        } else if (action === "disabled") {
          failedSteps.add(i);
        }
      }

      expect(actions).toEqual(["skipped", "skipped", "skipped"]);
    });
  });
});

describe("D2: resolvePassThroughOutputs / isRunOk - the single shared implementation", () => {
  it("salvages a value from a genuinely-succeeded upstream step", () => {
    const result = resolvePassThroughOutputs(
      { files: "files" },
      { files: STEP(0, "files") },
      new Set(),
      [{ files: ["a", "b"] }]
    );
    expect(result).toEqual({ passedThrough: true, outputs: { files: ["a", "b"] } });
  });

  it("never salvages from a step that itself genuinely failed", () => {
    const result = resolvePassThroughOutputs(
      { files: "files" },
      { files: STEP(0, "files") },
      new Set([0]),
      [{ files: ["a"] }]
    );
    expect(result).toEqual({ passedThrough: false, outputs: {} });
  });

  it("isRunOk: clean when nothing failed, disabled, skipped, or passed through", () => {
    expect(isRunOk(new Set(), new Set(), new Set(), new Set())).toBe(true);
  });

  it("isRunOk: not ok when a pass-through failure exists even though failedSteps never recorded it", () => {
    expect(isRunOk(new Set(), new Set(), new Set(), new Set([5]))).toBe(false);
  });

  it(
    "D2: a manufactured case where the OLD cardinality-proxy formula " +
      "(failedSteps.size > disabledRunIndices.size + skippedRunIndices.size) disagrees with the correct set-difference " +
      "answer isRunOk actually computes - proving the two were genuinely different algorithms, not just differently phrased",
    () => {
      // disabledRunIndices contains an index (2) that is NOT itself in
      // failedSteps - impossible to reach through the real run loop (a step
      // is always added to failedSteps in the SAME branch that adds it to
      // disabledRunIndices), but nothing in either OLD algorithm's own
      // signature ever enforced that invariant - both took three bare Sets
      // and trusted the caller. This is exactly the kind of latent
      // assumption that made them two independent implementations rather
      // than one - see isRunOk's own doc comment.
      const failedSteps = new Set([1]);
      const disabledRunIndices = new Set([2]);
      const skippedRunIndices = new Set<number>();
      const passThroughFailures = new Set<number>();

      // The old useWorkflowRun.pass-through.ts formula, reproduced verbatim
      // here (not imported - it no longer exists) purely to demonstrate the
      // disagreement.
      const oldCardinalityProxyGenuineFailure =
        failedSteps.size > disabledRunIndices.size + skippedRunIndices.size || passThroughFailures.size > 0;

      const ok = isRunOk(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures);

      // Old proxy: 1 > 1 + 0 is false -> "not a genuine failure" -> reports OK.
      expect(oldCardinalityProxyGenuineFailure).toBe(false);
      // Correct (set-difference) answer: step 1 failed and is in neither
      // disabledRunIndices nor skippedRunIndices - genuinely not ok.
      expect(ok).toBe(false);
      // The two algorithms disagree on this exact input.
      expect(ok).not.toBe(!oldCardinalityProxyGenuineFailure);
    }
  );
});

describe("enabledRuntimeFields", () => {
  it("collects runtime fields only from ENABLED (non-disabled) steps, first-occurrence-wins", () => {
    const stepA: WorkflowStepConfig = { type: "a", bindings: { name: RUNTIME("who") } };
    const stepB: WorkflowStepConfig = { type: "b", bindings: { other: RUNTIME("skip-me") } };
    const defA = makeStepDef("a", [{ key: "name", label: "Name", type: "text", required: true }]);
    const defB = makeStepDef("b", [{ key: "other", label: "Other", type: "text", required: false }]);
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [stepA, stepB] };
    const lookup = (type: string) => (type === "a" ? defA : type === "b" ? defB : undefined);

    const fields = enabledRuntimeFields(def, [stepA, stepB], [0, 1], new Set([1]), lookup);
    expect(fields.map((f) => f.fieldKey)).toEqual(["who"]);
  });
});

describe("StepRunOutcome shape sanity (used by both engines' report accumulators)", () => {
  it("accepts every real status this module models", () => {
    const statuses: StepRunOutcome["status"][] = ["done", "error", "disabled", "needs-interaction", "skipped"];
    for (const status of statuses) {
      const outcome: StepRunOutcome = { index: 0, type: "x", status, error: null, summary: null };
      expect(outcome.status).toBe(status);
    }
  });
});
