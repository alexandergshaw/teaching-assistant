// Pure logic for mirroring steps from an included workflow: selecting which
// steps to mirror, detecting dangling outputs, and managing remap entries.

import type { WorkflowDef, WorkflowStepConfig, InputBinding } from "@/lib/workflows/types";
import type { StepDefinition } from "@/lib/workflows/registry";

/**
 * Resolve a `{source:"step"}` binding to the index it points at within
 * `sourceSteps` - the SOURCE workflow's OWN top-level steps, the same
 * def-local coordinates skipSteps/remap already use. `stepIndex` is used
 * as-is; `stepId` is looked up by name among those same steps (the
 * authoring-time id namespace is per-def, exactly like expandWorkflowDef's
 * own id resolution). Undefined when a stepId names no step here - an
 * unresolvable reference is types.expand.ts's problem to report loudly at
 * expansion time; this mirror only needs to know whether a reference points
 * at a step the include is about to SKIP.
 */
function resolveSourceStepIndex(
  sourceSteps: WorkflowStepConfig[],
  binding: InputBinding & { source: "step" }
): number | undefined {
  if ("stepIndex" in binding) return binding.stepIndex;
  const idx = sourceSteps.findIndex((s) => s.id === binding.stepId);
  return idx === -1 ? undefined : idx;
}

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
  key: string; // "<skippedIdx>.<outputKey>" - the canonical, numeric remap key.
  // The ALTERNATE remap key this same slot could be written under, when the
  // skipped source step itself carries an id: "<skippedStepId>.<outputKey>".
  // A remap entry set through an id-carrying preset lives here, not under
  // `key` - see remapEntryKey, which is how a reader finds either form.
  idKey?: string;
  droppedIndex: number;
  outputKey: string;
  outputType: string;
  outputLabel: string;
  referencedBy: string; // "Step N binding" or "Step N runIf"
}

/**
 * The key `include.remap` actually stores this dangling output's entry
 * under, if any: `dangling.idKey` when the skipped step carries an id AND a
 * remap entry already lives there, `dangling.key` (the numeric form)
 * otherwise. Both reading a dangling output's current remap value and
 * writing a new one go through this, so an edit updates the SAME key an
 * id-keyed entry already lives under instead of adding a second, numeric
 * key for the same slot (see builder/DanglingOutputs.tsx).
 */
export function remapEntryKey(
  remap: Record<string, InputBinding>,
  dangling: Pick<DanglingOutput, "key" | "idKey">
): string {
  if (dangling.idKey && remap[dangling.idKey] !== undefined) return dangling.idKey;
  return dangling.key;
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
      if (binding.source !== "step") continue;
      const droppedIdx = resolveSourceStepIndex(sourceSteps, binding);
      if (droppedIdx === undefined || !skip.has(droppedIdx)) continue;
      const outputKey = binding.outputKey;
      const key = `${droppedIdx}.${outputKey}`;

      if (!dangling.has(key)) {
        const droppedStep = sourceSteps[droppedIdx];
        const droppedDef = getStepDef(droppedStep.type);
        const outputSpec = droppedDef?.outputs?.find((o) => o.key === outputKey);

        dangling.set(key, {
          key,
          idKey: droppedStep.id ? `${droppedStep.id}.${outputKey}` : undefined,
          droppedIndex: droppedIdx,
          outputKey,
          outputType: outputSpec?.type || "unknown",
          outputLabel: outputSpec?.label || outputKey,
          referencedBy: `Step ${stepIdx + 1} binding`,
        });
      }
    }

    // Check runIf for references to dropped steps
    if (step.runIf && step.runIf.binding.source === "step") {
      const droppedIdx = resolveSourceStepIndex(sourceSteps, step.runIf.binding);
      if (droppedIdx !== undefined && skip.has(droppedIdx)) {
        const outputKey = step.runIf.binding.outputKey;
        const key = `${droppedIdx}.${outputKey}`;

        if (!dangling.has(key)) {
          const droppedStep = sourceSteps[droppedIdx];
          const droppedDef = getStepDef(droppedStep.type);
          const outputSpec = droppedDef?.outputs?.find((o) => o.key === outputKey);

          dangling.set(key, {
            key,
            idKey: droppedStep.id ? `${droppedStep.id}.${outputKey}` : undefined,
            droppedIndex: droppedIdx,
            outputKey,
            outputType: outputSpec?.type || "unknown",
            outputLabel: outputSpec?.label || outputKey,
            referencedBy: `Step ${stepIdx + 1} runIf`,
          });
        }
      }
    }
  });

  return Array.from(dangling.values());
}

/**
 * Update skipSteps when a checkbox is toggled: add or remove the source step
 * index, keeping the array sorted. If re-checking (adding back to the mirrored
 * set), prune any stale remap entries keyed "<thatIndex>." AND, when the
 * source step itself carries an id, "<thatId>." too - a remap entry for the
 * same slot can live under either key (see remapEntryKey), and pruning only
 * the numeric prefix would let an id-keyed entry survive re-checking the box.
 * `sourceStepId` is optional so existing positional callers/tests are unaffected.
 */
export function toggleSkipStep(
  include: NonNullable<WorkflowStepConfig["include"]>,
  sourceIndex: number,
  keep: boolean, // true = mirror (remove from skipSteps), false = skip
  sourceStepId?: string
): NonNullable<WorkflowStepConfig["include"]> {
  const skip = new Set(include.skipSteps);

  if (keep) {
    // Re-checking: remove from skipSteps
    skip.delete(sourceIndex);

    // Prune remap entries for this step, by numeric index prefix or, when
    // this source step carries an id, by its id prefix too.
    const remap = { ...include.remap };
    const prefix = `${sourceIndex}.`;
    const idPrefix = sourceStepId ? `${sourceStepId}.` : null;
    for (const key of Object.keys(remap)) {
      if (key.startsWith(prefix) || (idPrefix && key.startsWith(idPrefix))) {
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
