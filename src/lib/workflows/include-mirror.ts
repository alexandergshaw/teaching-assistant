// Pure logic for mirroring steps from an included workflow: selecting which
// steps to mirror, detecting dangling outputs, and managing remap entries.

import type { WorkflowDef, WorkflowStepConfig, InputBinding } from "@/lib/workflows/types";
import type { StepDefinition } from "@/lib/workflows/registry";

/**
 * Generate a human-readable label for a step in the source workflow.
 * For include-type steps, shows "Include workflow: <name>". For unknown types,
 * shows the raw type string.
 */
export function sourceStepLabel(
  step: WorkflowStepConfig,
  stepIndex: number,
  others: WorkflowDef[],
  getStepDef: (type: string) => StepDefinition | undefined
): string {
  const def = getStepDef(step.type);
  const name = def?.name || step.type;

  if (step.type === "include-workflow" && step.include) {
    const sourceName = others.find((w) => w.id === step.include!.workflowId)?.name || "unknown";
    return `Include workflow: ${sourceName}`;
  }

  return name;
}

/**
 * An entry in the dangling outputs list: an output from a skipped step that is
 * referenced by a kept step.
 */
export interface DanglingOutput {
  key: string; // "<skippedIdx>.<outputKey>"
  droppedIndex: number;
  outputKey: string;
  outputType: string;
  outputLabel: string;
  referencedBy: string; // "Step N binding" or "Step N runIf"
}

/**
 * Compute the set of outputs from skipped source steps that are still
 * referenced by kept source steps. Returns an array of dangling outputs,
 * deduplicated by key.
 */
export function danglingOutputs(
  sourceSteps: WorkflowStepConfig[],
  skipSteps: number[],
  getStepDef: (type: string) => StepDefinition | undefined
): DanglingOutput[] {
  const skip = new Set(skipSteps);
  const dangling = new Map<string, DanglingOutput>();

  sourceSteps.forEach((step, stepIdx) => {
    if (skip.has(stepIdx)) return; // Skip dropped steps

    // Check bindings for references to dropped steps
    for (const [, binding] of Object.entries(step.bindings)) {
      if (binding.source === "step" && skip.has(binding.stepIndex)) {
        const droppedIdx = binding.stepIndex;
        const outputKey = binding.outputKey;
        const key = `${droppedIdx}.${outputKey}`;

        if (!dangling.has(key)) {
          const droppedStep = sourceSteps[droppedIdx];
          const droppedDef = getStepDef(droppedStep.type);
          const outputSpec = droppedDef?.outputs?.find((o) => o.key === outputKey);

          dangling.set(key, {
            key,
            droppedIndex: droppedIdx,
            outputKey,
            outputType: outputSpec?.type || "unknown",
            outputLabel: outputSpec?.label || outputKey,
            referencedBy: `Step ${stepIdx + 1} binding`,
          });
        }
      }
    }

    // Check runIf for references to dropped steps
    if (step.runIf && step.runIf.binding.source === "step" && skip.has(step.runIf.binding.stepIndex)) {
      const droppedIdx = step.runIf.binding.stepIndex;
      const outputKey = step.runIf.binding.outputKey;
      const key = `${droppedIdx}.${outputKey}`;

      if (!dangling.has(key)) {
        const droppedStep = sourceSteps[droppedIdx];
        const droppedDef = getStepDef(droppedStep.type);
        const outputSpec = droppedDef?.outputs?.find((o) => o.key === outputKey);

        dangling.set(key, {
          key,
          droppedIndex: droppedIdx,
          outputKey,
          outputType: outputSpec?.type || "unknown",
          outputLabel: outputSpec?.label || outputKey,
          referencedBy: `Step ${stepIdx + 1} runIf`,
        });
      }
    }
  });

  return Array.from(dangling.values());
}

/**
 * Update skipSteps when a checkbox is toggled: add or remove the source step
 * index, keeping the array sorted. If re-checking (adding back to the mirrored
 * set), prune any stale remap entries keyed "<thatIndex>.".
 */
export function toggleSkipStep(
  include: NonNullable<WorkflowStepConfig["include"]>,
  sourceIndex: number,
  keep: boolean // true = mirror (remove from skipSteps), false = skip
): NonNullable<WorkflowStepConfig["include"]> {
  const skip = new Set(include.skipSteps);

  if (keep) {
    // Re-checking: remove from skipSteps
    skip.delete(sourceIndex);

    // Prune remap entries for this step
    const remap = { ...include.remap };
    const prefix = `${sourceIndex}.`;
    for (const key of Object.keys(remap)) {
      if (key.startsWith(prefix)) {
        delete remap[key];
      }
    }

    return {
      ...include,
      skipSteps: Array.from(skip).sort((a, b) => a - b),
      remap,
    };
  } else {
    // Unchecking: add to skipSteps
    skip.add(sourceIndex);
    return {
      ...include,
      skipSteps: Array.from(skip).sort((a, b) => a - b),
    };
  }
}

/**
 * Set or clear a remap entry for a dangling output. If binding is null,
 * the entry is removed (engine fallback handles it). Otherwise, the entry
 * is set to the provided binding.
 */
export function setRemapEntry(
  include: NonNullable<WorkflowStepConfig["include"]>,
  key: string, // "<droppedIdx>.<outputKey>"
  binding: InputBinding | null
): NonNullable<WorkflowStepConfig["include"]> {
  const remap = { ...include.remap };

  if (binding === null) {
    delete remap[key];
  } else {
    remap[key] = binding;
  }

  return {
    ...include,
    remap,
  };
}
