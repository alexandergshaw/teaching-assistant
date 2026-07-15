import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { outputFeedsInput } from "./types";

// The seven presets added to lead the Workflows page, in their expected order.
const NEW_PRESET_IDS = [
  "draft-and-post-announcement",
  "weekly-study-guide-page",
  "weekly-lecture-narration",
  "weekly-lecture-video",
  "quiz-from-repo",
  "assignment-kit",
  "grow-knowledge-base",
];

describe("new lead presets", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("registers the seven new presets first, in order", () => {
    expect(all.slice(0, NEW_PRESET_IDS.length).map((w) => w.id)).toEqual(NEW_PRESET_IDS);
  });

  it("assigns each new preset a unique id", () => {
    const ids = all.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const id of NEW_PRESET_IDS) {
    it(`${id} has valid, type-checked bindings`, () => {
      const wf = byId.get(id);
      expect(wf, `preset ${id} is registered`).toBeTruthy();

      wf!.steps.forEach((step, i) => {
        const def = getStepDefinition(step.type);
        expect(def, `${id} step ${i}: unknown step type ${step.type}`).toBeTruthy();
        const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));

        for (const [key, binding] of Object.entries(step.bindings)) {
          const input = inputByKey.get(key);
          expect(input, `${id} step ${i}: no such input "${key}" on ${step.type}`).toBeTruthy();

          if (binding.source === "step") {
            expect(binding.stepIndex, `${id} step ${i}: forward ref`).toBeLessThan(i);
            const src = getStepDefinition(wf!.steps[binding.stepIndex].type);
            expect(src, `${id} step ${i}: unknown source step`).toBeTruthy();
            const out = src!.outputs.find((o) => o.key === binding.outputKey);
            expect(out, `${id} step ${i}: source has no output "${binding.outputKey}"`).toBeTruthy();
            expect(
              outputFeedsInput(out!.type, input!.type),
              `${id} step ${i}: ${out!.type} cannot feed ${input!.type} (input ${key})`
            ).toBe(true);
          }
        }

        for (const inp of def!.inputs) {
          if (inp.required) {
            expect(step.bindings[inp.key], `${id} step ${i}: required input "${inp.key}" is unbound`).toBeTruthy();
          }
        }
      });
    });
  }
});
