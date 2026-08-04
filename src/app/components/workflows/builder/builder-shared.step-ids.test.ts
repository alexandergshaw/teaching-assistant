// TDD for CHUNK E-a2 (the builder half of the step-id migration), written from the
// acceptance criteria BEFORE the implementation existed. Make these pass without changing
// what they assert.
//
// WHY THIS CHUNK MUST LAND BEFORE THE PRESETS MIGRATE.
//
// The builder is handed the RAW, unexpanded def (WorkflowPanel passes `selectedDef`
// straight through), and presets are editable through the override mechanism. So the
// moment a preset carries `stepId` bindings, the builder sees them - and today it
// destroys them, then persists the destruction:
//
//   - normalizeBindings reads `binding.stepIndex`, gets `undefined` for an id binding,
//     looks up `def.steps[undefined]`, finds nothing, and DEMOTES the binding to
//     `{source:"runtime"}`. It runs on add-step, remove, move, append and include - so
//     adding one action to Course Build would demote every id binding in the def.
//   - remapStepReferences then writes `stepIndex: undefined` (remove/move) or
//     `stepIndex: NaN` (append, via `oldIndex + offset`) into include remap/bindOverrides
//     values, which normalizeBindings does not clean because it early-returns on include
//     steps.
//   - the damaged def is saved through diffAgainstPreset, which JSON-compares
//     `{stepId:"tile"}` against `{fieldKey:"description"}`, sees a difference, and writes
//     a spurious per-step override into localStorage and Supabase.
//
// The rule these tests encode: an id binding does not need remapping when indices shift.
// That is the entire point of ids. So the builder must PRESERVE it, not rewrite it.
import { describe, it, expect } from "vitest";
import { normalizeBindings, remapStepReferences } from "./builder-shared";
import type { WorkflowDef, WorkflowStepConfig } from "@/lib/workflows/types";

// load-course-tile emits `description` (longtext); generate-schedule takes `description`
// (longtext). Verified against the real registry, so outputFeedsInput is satisfied and a
// correct implementation has no reason to demote.
function twoStepDef(binding: WorkflowStepConfig["bindings"]["description"]): WorkflowDef {
  return {
    id: "wf",
    name: "wf",
    description: "",
    steps: [
      { id: "tile", type: "load-course-tile", bindings: {} },
      { id: "schedule", type: "generate-schedule", bindings: { description: binding } },
    ],
  };
}

describe("normalizeBindings preserves id bindings", () => {
  it("keeps a valid stepId binding instead of demoting it to Ask when running", () => {
    const out = normalizeBindings(twoStepDef({ source: "step", stepId: "tile", outputKey: "description" }));
    expect(out.steps[1].bindings.description).toEqual({
      source: "step",
      stepId: "tile",
      outputKey: "description",
    });
  });

  // The control: the positional path must behave exactly as it always has.
  it("still keeps the equivalent stepIndex binding", () => {
    const out = normalizeBindings(twoStepDef({ source: "step", stepIndex: 0, outputKey: "description" }));
    expect(out.steps[1].bindings.description).toEqual({
      source: "step",
      stepIndex: 0,
      outputKey: "description",
    });
  });

  // Dangling references must STILL demote - preserving ids must not become
  // "preserve anything that carries a stepId".
  it("demotes a stepId binding naming a step that does not exist", () => {
    const out = normalizeBindings(twoStepDef({ source: "step", stepId: "ghost", outputKey: "description" }));
    expect(out.steps[1].bindings.description).toEqual({ source: "runtime", fieldKey: "description" });
  });

  it("demotes a stepId binding naming a LATER step, matching the positional forward-reference rule", () => {
    const def: WorkflowDef = {
      id: "wf",
      name: "wf",
      description: "",
      steps: [
        { id: "schedule", type: "generate-schedule", bindings: { description: { source: "step", stepId: "tile", outputKey: "description" } } },
        { id: "tile", type: "load-course-tile", bindings: {} },
      ],
    };
    expect(normalizeBindings(def).steps[0].bindings.description).toEqual({
      source: "runtime",
      fieldKey: "description",
    });
  });

  it("demotes a stepId binding whose output type cannot feed the input", () => {
    // `weeks` is a number output; `description` is longtext. outputFeedsInput is false.
    const out = normalizeBindings(twoStepDef({ source: "step", stepId: "tile", outputKey: "weeks" }));
    expect(out.steps[1].bindings.description).toEqual({ source: "runtime", fieldKey: "description" });
  });
});

describe("remapStepReferences leaves id bindings alone", () => {
  const idStep = (): WorkflowStepConfig => ({
    id: "schedule",
    type: "generate-schedule",
    bindings: { description: { source: "step", stepId: "tile", outputKey: "description" } },
  });

  // An id binding is position-independent by construction. A structural edit that shifts
  // every index must not touch it - not to a new index, and certainly not to a runtime
  // field.
  it("passes a stepId binding through a shifting remap untouched", () => {
    const out = remapStepReferences(idStep(), (i) => i + 5);
    expect(out.bindings.description).toEqual({ source: "step", stepId: "tile", outputKey: "description" });
  });

  it("does NOT demote a stepId binding when the remap would delete an index", () => {
    // mapIndex returning null means "that step was removed". An id binding does not
    // reference an index at all, so it must survive - the expander is what decides
    // whether the id still resolves.
    const out = remapStepReferences(idStep(), () => null);
    expect(out.bindings.description).toEqual({ source: "step", stepId: "tile", outputKey: "description" });
  });

  it("still remaps a stepIndex binding - the positional path is unchanged", () => {
    const step: WorkflowStepConfig = {
      type: "generate-schedule",
      bindings: { description: { source: "step", stepIndex: 0, outputKey: "description" } },
    };
    expect(remapStepReferences(step, (i) => i + 5).bindings.description).toEqual({
      source: "step",
      stepIndex: 5,
      outputKey: "description",
    });
    expect(remapStepReferences(step, () => null).bindings.description).toEqual({
      source: "runtime",
      fieldKey: "description",
    });
  });

  it("leaves a stepId runIf gate untouched while still remapping a positional one", () => {
    const byId: WorkflowStepConfig = {
      type: "fill-readmes",
      bindings: {},
      runIf: { binding: { source: "step", stepId: "resolve", outputKey: "repo" }, expected: true },
    };
    expect(remapStepReferences(byId, (i) => i + 3).runIf).toEqual({
      binding: { source: "step", stepId: "resolve", outputKey: "repo" },
      expected: true,
    });

    const byIndex: WorkflowStepConfig = {
      type: "fill-readmes",
      bindings: {},
      runIf: { binding: { source: "step", stepIndex: 0, outputKey: "repo" }, expected: true },
    };
    expect(remapStepReferences(byIndex, (i) => i + 3).runIf).toEqual({
      binding: { source: "step", stepIndex: 3, outputKey: "repo" },
      expected: true,
    });
  });

  it("never writes an undefined or NaN stepIndex into an include's remap or bindOverrides", () => {
    const step: WorkflowStepConfig = {
      type: "include-workflow",
      bindings: {},
      include: {
        workflowId: "src",
        skipSteps: [0],
        remap: { "0.course": { source: "step", stepId: "tile", outputKey: "course" } },
        bindOverrides: { "1.selected": { source: "step", stepId: "tile", outputKey: "course" } },
      },
    };
    const out = remapStepReferences(step, (i) => i + 2);
    const values = [...Object.values(out.include!.remap), ...Object.values(out.include!.bindOverrides ?? {})];
    expect(values).toHaveLength(2);
    for (const b of values) {
      expect(b).toEqual({ source: "step", stepId: "tile", outputKey: "course" });
      // The specific corruption this guards: `oldIndex + offset` on an absent index.
      expect(JSON.stringify(b)).not.toContain("null");
      expect(JSON.stringify(b)).not.toContain("NaN");
    }
  });
});
