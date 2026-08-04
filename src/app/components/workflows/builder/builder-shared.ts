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
  assignmentTemplates?: Array<{ id: string; name: string }> | null;
  testTemplates?: Array<{ id: string; name: string }> | null;
  classSessionTemplates?: Array<{ id: string; name: string }> | null;
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
        if ("stepId" in binding) {
          // An id binding is position-independent by construction (that is
          // the entire point of naming a step instead of its array
          // position) - a structural edit must leave it ALONE, never
          // remapped and never demoted just because the index it WOULD
          // occupy cannot be looked up. It still has to be a genuinely
          // valid reference, though: resolve it against this def's own
          // steps by id (the same authoring-time namespace
          // expandWorkflowDef resolves against) and demote exactly like a
          // dangling/forward/type-incompatible stepIndex binding would -
          // "preserve ids" must not become "preserve anything carrying a
          // stepId". See builder-shared.step-ids.test.ts.
          const refStepIdx = def.steps.findIndex((s) => s.id === binding.stepId);
          const refStep = refStepIdx === -1 ? undefined : def.steps[refStepIdx];
          const refDef = refStep ? getStepDefinition(refStep.type) : null;
          const refOutput = refDef?.outputs.find((o) => o.key === binding.outputKey);

          const valid =
            refStepIdx !== -1 &&
            refStepIdx < stepIndex &&
            !!refStep &&
            !!refDef &&
            !!refOutput &&
            outputFeedsInput(refOutput.type, input.type);

          normalizedBindings[input.key] = valid
            ? binding
            : { source: "runtime", fieldKey: input.key };
          continue;
        }

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
      if (binding.source === "step" && "stepIndex" in binding) {
        const mapped = mapIndex(binding.stepIndex);
        out[key] =
          mapped === null
            ? { source: "runtime", fieldKey: fieldKeyFor(key, binding) }
            : { ...binding, stepIndex: mapped };
      } else {
        // Runtime/literal bindings pass through unchanged, and so does an id
        // binding: it names its source by id, not position, so a structural
        // edit that shifts every stepIndex must not touch it at all - not
        // remapped to a new index, and not demoted just because mapIndex
        // would have deleted the index it is deliberately NOT expressed in
        // terms of. See builder-shared.step-ids.test.ts.
        out[key] = binding;
      }
    }
    return out;
  };

  // Own bindings demote to the input key they fill.
  const bindings = remapRecord(step.bindings, (recordKey) => recordKey);

  // A "run only if" gate bound to a step output must follow the same index
  // remap; if the gate step is removed (mapIndex -> null) the gate is
  // dropped. An id-bound gate is left alone for the same reason an id
  // binding is above.
  let runIf = step.runIf;
  if (runIf && runIf.binding.source === "step" && "stepIndex" in runIf.binding) {
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
