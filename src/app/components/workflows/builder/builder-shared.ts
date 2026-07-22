import {
  type WorkflowDef,
  type WorkflowStepConfig,
  type InputBinding,
  outputFeedsInput,
  LITERAL_CAPABLE_TYPES,
} from "@/lib/workflows/types";
import { getStepDefinition } from "@/lib/workflows/registry";

// Picker data the builder threads down so a "Preset value" (literal) binding can
// be filled with a real course tile / institution / org instead of raw text.
export interface BuilderPickerData {
  hubCourses: Array<{ id: string; name: string }> | null;
  institutions: string[];
  orgs: string[] | null;
  deckTemplates?: Array<{ id: string; name: string }> | null;
}

// One searchable, category-grouped entry in the "Add action" palette.
export interface ActionOption {
  type: string;
  name: string;
  description: string;
  categoryId: string;
  categoryLabel: string;
}

function normalizeBindings(def: WorkflowDef): WorkflowDef {
  const normalized = { ...def };
  normalized.steps = def.steps.map((step, stepIndex) => {
    // Include steps have no own inputs to normalize; their remap is written
    // in this workflow's coordinates and must pass through untouched.
    if (step.type === "include-workflow") return step;

    const stepDef = getStepDefinition(step.type);
    if (!stepDef) return step;

    const normalizedBindings: Record<string, InputBinding> = {};

    for (const input of stepDef.inputs) {
      const binding = step.bindings[input.key];

      if (!binding) {
        normalizedBindings[input.key] = {
          source: "runtime",
          fieldKey: input.key,
        };
        continue;
      }

      if (binding.source === "runtime") {
        normalizedBindings[input.key] = binding;
      } else if (binding.source === "step") {
        const refStepIdx = binding.stepIndex;
        const refStep = def.steps[refStepIdx];
        const refDef = refStep ? getStepDefinition(refStep.type) : null;
        const refOutput = refDef?.outputs.find(
          (o) => o.key === binding.outputKey
        );

        if (
          refStepIdx < stepIndex &&
          refStep &&
          refDef &&
          refOutput &&
          outputFeedsInput(refOutput.type, input.type)
        ) {
          normalizedBindings[input.key] = binding;
        } else {
          normalizedBindings[input.key] = {
            source: "runtime",
            fieldKey: input.key,
          };
        }
      } else if (binding.source === "literal") {
        // Scalar literals (text/number/boolean toggles) AND the course /
        // institution / org entity types can carry a fixed value; preserve
        // those so a preset survives normalization. Everything else demotes to
        // an ask-when-running field.
        if (LITERAL_CAPABLE_TYPES.has(input.type)) {
          normalizedBindings[input.key] = binding;
        } else {
          normalizedBindings[input.key] = {
            source: "runtime",
            fieldKey: input.key,
          };
        }
      }
    }

    return {
      ...step,
      bindings: normalizedBindings,
    };
  });

  return normalized;
}

// Rewrites every "step"-source index inside a step's own bindings AND, for an
// include step, its include.remap and include.bindOverrides. mapIndex returns a
// new index, or null to demote the binding to a runtime field so no reference
// dangles after a structural edit. Plain-step binding behavior is unchanged.
function remapStepReferences(
  step: WorkflowStepConfig,
  mapIndex: (oldIndex: number) => number | null
): WorkflowStepConfig {
  const remapRecord = (
    record: Record<string, InputBinding>,
    fieldKeyFor: (
      recordKey: string,
      binding: Extract<InputBinding, { source: "step" }>
    ) => string
  ): Record<string, InputBinding> => {
    const out: Record<string, InputBinding> = {};
    for (const [key, binding] of Object.entries(record)) {
      if (binding.source === "step") {
        const mapped = mapIndex(binding.stepIndex);
        out[key] =
          mapped === null
            ? { source: "runtime", fieldKey: fieldKeyFor(key, binding) }
            : { ...binding, stepIndex: mapped };
      } else {
        out[key] = binding;
      }
    }
    return out;
  };

  // Own bindings demote to the input key they fill.
  const bindings = remapRecord(step.bindings, (recordKey) => recordKey);

  // A "run only if" gate bound to a step output must follow the same index
  // remap; if the gate step is removed (mapIndex -> null) the gate is dropped.
  let runIf = step.runIf;
  if (runIf && runIf.binding.source === "step") {
    const mapped = mapIndex(runIf.binding.stepIndex);
    runIf =
      mapped === null
        ? undefined
        : { ...runIf, binding: { ...runIf.binding, stepIndex: mapped } };
  }

  if (step.type === "include-workflow" && step.include) {
    // remap/bindOverrides values demote to the binding's own outputKey.
    const include = { ...step.include };
    include.remap = remapRecord(
      step.include.remap,
      (_key, binding) => binding.outputKey
    );
    if (step.include.bindOverrides) {
      include.bindOverrides = remapRecord(
        step.include.bindOverrides,
        (_key, binding) => binding.outputKey
      );
    }
    return { ...step, bindings, include, runIf };
  }

  return { ...step, bindings, runIf };
}

export { normalizeBindings, remapStepReferences };
