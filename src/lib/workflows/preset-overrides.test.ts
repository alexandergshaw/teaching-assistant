import { describe, it, expect } from "vitest";
import { diffAgainstPreset, resolvePresetOverride, toStoredDef } from "./preset-overrides";
import type { WorkflowDef, WorkflowStepConfig } from "./types";

function step(type: string, bindings: WorkflowStepConfig["bindings"] = {}): WorkflowStepConfig {
  return { type, bindings };
}

function preset(steps: WorkflowStepConfig[], overrides: Partial<WorkflowDef> = {}): WorkflowDef {
  return {
    id: "preset-a",
    name: "Preset A",
    description: "A preset.",
    preset: true,
    steps,
    ...overrides,
  };
}

describe("diffAgainstPreset", () => {
  it("returns a non-diverged, empty delta when the edited def is byte-identical to the preset", () => {
    const p = preset([step("load", { hubCourse: { source: "runtime", fieldKey: "hubCourse" } })]);
    const delta = diffAgainstPreset(p, { ...p, steps: JSON.parse(JSON.stringify(p.steps)) });
    expect(delta).toEqual({ name: undefined, description: undefined, diverged: false });
  });

  it("records only the input keys whose binding actually changed, not a full snapshot", () => {
    const p = preset([
      step("load", {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        allowMissingRepo: { source: "literal", value: "1" },
      }),
    ]);
    const edited = {
      ...p,
      steps: [
        step("load", {
          hubCourse: { source: "literal", value: "MY-COURSE" }, // changed
          allowMissingRepo: { source: "literal", value: "1" }, // unchanged
        }),
      ],
    };
    const delta = diffAgainstPreset(p, edited);
    expect(delta.diverged).toBe(false);
    expect(delta.stepOverrides).toEqual({
      0: {
        expectedType: "load",
        bindings: { hubCourse: { source: "literal", value: "MY-COURSE" } },
      },
    });
  });

  it("records a runIf change, including explicit clearing as null", () => {
    const p = preset([step("send")]);
    p.steps[0].runIf = { binding: { source: "literal", value: "1" }, expected: true };

    const cleared = diffAgainstPreset(p, { ...p, steps: [step("send")] });
    expect(cleared.stepOverrides).toEqual({ 0: { expectedType: "send", runIf: null } });

    const changed = diffAgainstPreset(p, {
      ...p,
      steps: [{ ...step("send"), runIf: { binding: { source: "literal", value: "0" }, expected: false } }],
    });
    expect(changed.stepOverrides).toEqual({
      0: { expectedType: "send", runIf: { binding: { source: "literal", value: "0" }, expected: false } },
    });
  });

  it("records an include-workflow step's target change wholesale", () => {
    const p = preset([
      { type: "include-workflow", bindings: {}, include: { workflowId: "source-a", skipSteps: [], remap: {} } },
    ]);
    const edited = {
      ...p,
      steps: [
        { type: "include-workflow", bindings: {}, include: { workflowId: "source-b", skipSteps: [1], remap: {} } },
      ],
    };
    const delta = diffAgainstPreset(p, edited);
    expect(delta.stepOverrides?.[0]?.include).toEqual({ workflowId: "source-b", skipSteps: [1], remap: {} });
  });

  it("marks diverged when the step count differs (added or removed steps)", () => {
    const p = preset([step("a"), step("b")]);
    const added = diffAgainstPreset(p, { ...p, steps: [step("a"), step("b"), step("c")] });
    expect(added.diverged).toBe(true);
    expect(added.stepOverrides).toBeUndefined();

    const removed = diffAgainstPreset(p, { ...p, steps: [step("a")] });
    expect(removed.diverged).toBe(true);
  });

  it("marks diverged when steps are reordered (same count, different types per index)", () => {
    const p = preset([step("a"), step("b")]);
    const reordered = diffAgainstPreset(p, { ...p, steps: [step("b"), step("a")] });
    expect(reordered.diverged).toBe(true);
  });

  it("records a name/description override only when they actually differ", () => {
    const p = preset([step("a")]);
    const delta = diffAgainstPreset(p, { ...p, name: "My Custom Name" });
    expect(delta.name).toBe("My Custom Name");
    expect(delta.description).toBeUndefined();
  });
});

describe("resolvePresetOverride", () => {
  it("is a no-op resolve for an empty (non-diverged, no stepOverrides) delta - re-derives the preset untouched", () => {
    const p = preset([step("a", { x: { source: "runtime", fieldKey: "x" } })]);
    const stored: WorkflowDef = { ...p, steps: [], presetOverrideDelta: { diverged: false } };
    const resolved = resolvePresetOverride(p, stored);
    expect(resolved.steps).toEqual(p.steps);
    expect(resolved.presetOverride).toEqual({ diverged: false });
    expect(resolved.preset).toBe(true);
  });

  it("applies stepOverrides bindings on top of the CURRENT preset step, preserving untouched keys", () => {
    const p = preset([
      step("load", {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        allowMissingRepo: { source: "literal", value: "1" },
      }),
    ]);
    const stored: WorkflowDef = {
      ...p,
      steps: [],
      presetOverrideDelta: {
        diverged: false,
        stepOverrides: {
          0: { expectedType: "load", bindings: { hubCourse: { source: "literal", value: "MY-COURSE" } } },
        },
      },
    };
    const resolved = resolvePresetOverride(p, stored);
    expect(resolved.steps[0].bindings).toEqual({
      hubCourse: { source: "literal", value: "MY-COURSE" },
      allowMissingRepo: { source: "literal", value: "1" },
    });
  });

  it("a preset step gained AFTER the override was saved is untouched and simply appears (AC2)", () => {
    // Simulates the actual regression: the override targeted a 1-step
    // preset; the preset later grows a new step 0 (e.g. define-course-project),
    // shifting the originally-overridden step to index 1.
    const oldPreset = preset([step("load", { hubCourse: { source: "runtime", fieldKey: "hubCourse" } })]);
    const stored: WorkflowDef = {
      ...oldPreset,
      steps: [],
      presetOverrideDelta: {
        diverged: false,
        stepOverrides: {
          0: { expectedType: "load", bindings: { hubCourse: { source: "literal", value: "MY-COURSE" } } },
        },
      },
    };

    const grownPreset = preset([
      step("define-course-project", { definition: { source: "runtime", fieldKey: "definition" } }),
      step("load", { hubCourse: { source: "runtime", fieldKey: "hubCourse" } }),
    ]);

    const resolved = resolvePresetOverride(grownPreset, stored);
    // The new step is present, from the CURRENT preset, and carries EXACTLY
    // its own bindings - the override targeting the old index 0 must not
    // leak an unrelated "hubCourse" key onto it (type mismatch: "load" !==
    // "define-course-project", so it is safely skipped there)...
    expect(resolved.steps[0].type).toBe("define-course-project");
    expect(resolved.steps[0].bindings).toEqual({ definition: { source: "runtime", fieldKey: "definition" } });
    // ...and the "load" step, now at index 1, reverts to the preset's own
    // default binding rather than being corrupted by a mismatched override -
    // this is the accepted, documented tradeoff (see WorkflowStepOverrideDelta).
    expect(resolved.steps[1].bindings.hubCourse).toEqual({ source: "runtime", fieldKey: "hubCourse" });
  });

  it("a preset step that gains a brand-new INPUT is left alone and inherits the preset's own default (AC2)", () => {
    const oldPreset = preset([step("load", { hubCourse: { source: "runtime", fieldKey: "hubCourse" } })]);
    const stored: WorkflowDef = {
      ...oldPreset,
      steps: [],
      presetOverrideDelta: {
        diverged: false,
        stepOverrides: {
          0: { expectedType: "load", bindings: { hubCourse: { source: "literal", value: "MY-COURSE" } } },
        },
      },
    };
    const grownPreset = preset([
      step("load", {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        newInput: { source: "literal", value: "default" },
      }),
    ]);
    const resolved = resolvePresetOverride(grownPreset, stored);
    expect(resolved.steps[0].bindings).toEqual({
      hubCourse: { source: "literal", value: "MY-COURSE" }, // user's override kept
      newInput: { source: "literal", value: "default" }, // new preset default inherited
    });
  });

  it("when diverged, ignores the current preset's steps entirely and uses the stored frozen list", () => {
    const p = preset([step("a"), step("b")]);
    const frozenSteps = [step("z"), step("y"), step("x")];
    const stored: WorkflowDef = {
      ...p,
      steps: frozenSteps,
      presetOverrideDelta: { diverged: true },
    };
    const resolved = resolvePresetOverride(p, stored);
    expect(resolved.steps).toEqual(frozenSteps);
    expect(resolved.presetOverride).toEqual({ diverged: true });
  });

  it("applies a name/description override from the delta", () => {
    const p = preset([step("a")]);
    const stored: WorkflowDef = {
      ...p,
      steps: [],
      presetOverrideDelta: { diverged: false, name: "Renamed" },
    };
    expect(resolvePresetOverride(p, stored).name).toBe("Renamed");
  });

  it("is idempotent: resolving the same stored delta twice yields the same result", () => {
    const p = preset([step("load", { hubCourse: { source: "runtime", fieldKey: "hubCourse" } })]);
    const stored: WorkflowDef = {
      ...p,
      steps: [],
      presetOverrideDelta: {
        diverged: false,
        stepOverrides: { 0: { expectedType: "load", bindings: { hubCourse: { source: "literal", value: "X" } } } },
      },
    };
    expect(resolvePresetOverride(p, stored)).toEqual(resolvePresetOverride(p, stored));
  });
});

describe("toStoredDef", () => {
  const getPreset = (id: string): WorkflowDef | undefined =>
    id === "preset-a" ? preset([step("load", { hubCourse: { source: "runtime", fieldKey: "hubCourse" } })]) : undefined;

  it("passes a plain custom workflow (unknown id) through unchanged, stripping any stray override metadata", () => {
    const custom: WorkflowDef = {
      id: "custom-1",
      name: "My workflow",
      description: "",
      steps: [step("a")],
      presetOverride: { diverged: true }, // should never leak into storage
    };
    const stored = toStoredDef(custom, getPreset);
    expect(stored.presetOverrideDelta).toBeUndefined();
    expect(stored.presetOverride).toBeUndefined();
    expect(stored.steps).toEqual([step("a")]);
    expect(stored.id).toBe("custom-1");
  });

  it("stores a non-diverged delta (not a full copy) for a scope-only preset edit", () => {
    const edited: WorkflowDef = {
      ...getPreset("preset-a")!,
      scope: { hubCourse: "*" },
    };
    const stored = toStoredDef(edited, getPreset);
    expect(stored.presetOverrideDelta?.diverged).toBe(false);
    expect(stored.presetOverrideDelta?.stepOverrides).toBeUndefined();
    expect(stored.steps).toEqual([]); // not a frozen copy
    expect(stored.scope).toEqual({ hubCourse: "*" });
  });

  it("stores the full frozen step list only once a structural edit makes it diverged", () => {
    const edited: WorkflowDef = {
      ...getPreset("preset-a")!,
      steps: [step("load", { hubCourse: { source: "runtime", fieldKey: "hubCourse" } }), step("new-step")],
    };
    const stored = toStoredDef(edited, getPreset);
    expect(stored.presetOverrideDelta?.diverged).toBe(true);
    expect(stored.steps).toEqual(edited.steps);
  });

  it("round-trips through toStoredDef -> resolvePresetOverride back to the edited def (save then reload)", () => {
    const p = getPreset("preset-a")!;
    const edited: WorkflowDef = {
      ...p,
      steps: [step("load", { hubCourse: { source: "literal", value: "MY-COURSE" } })],
    };
    const stored = toStoredDef(edited, getPreset);
    const resolved = resolvePresetOverride(p, stored);
    expect(resolved.steps).toEqual(edited.steps);
  });

  it("re-saving an already-resolved def (idempotent save) produces the same stored delta again", () => {
    const p = getPreset("preset-a")!;
    const edited: WorkflowDef = {
      ...p,
      steps: [step("load", { hubCourse: { source: "literal", value: "MY-COURSE" } })],
    };
    const stored1 = toStoredDef(edited, getPreset);
    const resolved1 = resolvePresetOverride(p, stored1);
    // Re-save exactly what got resolved back (simulates the builder firing
    // onChange again with no further edits) - must reach the same delta,
    // not accumulate or drift.
    const stored2 = toStoredDef(resolved1, getPreset);
    expect(stored2).toEqual(stored1);
  });
});
