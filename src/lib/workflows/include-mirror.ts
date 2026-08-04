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
 * Resolve a whole skipSteps array (indices and/or ids, see
 * WorkflowStepConfig's own doc comment in types.ts) against `sourceSteps` -
 * the SOURCE workflow's own top-level steps - into the deduplicated set of
 * indices it actually drops. Shared by danglingOutputs (below) and the
 * builder's own step-mirroring UI (StepCard.tsx), so both agree on exactly
 * which steps an id- and/or index-mixed skipSteps array drops: an index and
 * an id naming the SAME step collapse to one entry here, exactly as they do
 * in expandWorkflowDef itself (types.expand.ts). An unresolvable or
 * ambiguous id throws, naming it - the same "loud, not silently wrong" call
 * types.expand.ts makes for the real expansion: a builder checkbox or count
 * that silently mis-renders (mirrored when the step is really dropped, or a
 * miscounted total) is worse than surfacing a stale preset id as an error.
 */
export function resolveSkipIndices(
  sourceSteps: WorkflowStepConfig[],
  skipSteps: ReadonlyArray<number | string>
): Set<number> {
  const skip = new Set<number>();
  for (const entry of skipSteps) {
    if (typeof entry === "number") {
      skip.add(entry);
      continue;
    }
    const matches: number[] = [];
    sourceSteps.forEach((s, i) => {
      if (s.id === entry) matches.push(i);
    });
    if (matches.length === 0) {
      throw new Error(`Include skipSteps entry references unknown step id "${entry}".`);
    }
    if (matches.length > 1) {
      throw new Error(
        `Include skipSteps entry references step id "${entry}", which is ambiguous - more than one step uses that id.`
      );
    }
    skip.add(matches[0]);
  }
  return skip;
}

/**
 * Compute the set of outputs from skipped source steps that are still
 * referenced by kept source steps. Returns an array of dangling outputs,
 * deduplicated by key.
 */
export function danglingOutputs(
  sourceSteps: WorkflowStepConfig[],
  skipSteps: (number | string)[],
  getStepDef: (type: string) => StepDefinition | undefined
): DanglingOutput[] {
  const skip = resolveSkipIndices(sourceSteps, skipSteps);
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

// skipSteps entries sort NUMBERS first (ascending, matching the pre-chunk-F
// positional behavior exactly, so a purely numeric include is byte-for-byte
// unaffected), then STRINGS (alphabetically) - deterministic, and immune to
// the `(a, b) => a - b` comparator's own failure mode: subtracting a string
// is NaN, which Array.prototype.sort treats as "equal", so a mixed array
// under the old comparator lost its ordering guarantee entirely rather than
// merely reordering.
function sortSkipSteps(skip: Set<number | string>): (number | string)[] {
  return Array.from(skip).sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "number") return -1;
    if (typeof b === "number") return 1;
    return a.localeCompare(b);
  });
}

/**
 * Update skipSteps when a checkbox is toggled: add or remove the source step
 * index, keeping the array sorted. If re-checking (adding back to the mirrored
 * set), prune any stale remap entries keyed "<thatIndex>." AND, when the
 * source step itself carries an id, "<thatId>." too - a remap entry for the
 * same slot can live under either key (see remapEntryKey), and pruning only
 * the numeric prefix would let an id-keyed entry survive re-checking the box.
 * `sourceStepId` is optional so existing positional callers/tests are unaffected.
 *
 * Re-checking (`keep: true`) removes the step from skipSteps under BOTH its
 * numeric index AND, when `sourceStepId` is given, its id - the same dropped
 * slot can be named either way (an id-carrying code preset skips by id; a
 * stored/legacy entry skips by index), so re-checking must clear whichever
 * form is actually present or the id-keyed one silently survives and keeps
 * mirroring the step as dropped.
 *
 * Unchecking (`keep: false`) always adds a NUMBER, never `sourceStepId` -
 * deliberately: ids in skipSteps are a CODE-PRESET authoring feature only
 * (see WorkflowStepConfig's own doc comment, types.ts). The builder is the
 * only writer of stored workflow data, so this is what keeps a string out of
 * it entirely - an older build's skip check (index-only, pre-chunk-F) would
 * otherwise silently MIRROR a step a newer build correctly skipped.
 */
export function toggleSkipStep(
  include: NonNullable<WorkflowStepConfig["include"]>,
  sourceIndex: number,
  keep: boolean, // true = mirror (remove from skipSteps), false = skip
  sourceStepId?: string
): NonNullable<WorkflowStepConfig["include"]> {
  const skip = new Set<number | string>(include.skipSteps);

  if (keep) {
    // Re-checking: remove from skipSteps, both forms.
    skip.delete(sourceIndex);
    if (sourceStepId !== undefined) skip.delete(sourceStepId);

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
      skipSteps: sortSkipSteps(skip),
      remap,
    };
  } else {
    // Unchecking: add to skipSteps - always the numeric index (see this
    // function's own doc comment for why sourceStepId is never used here).
    skip.add(sourceIndex);
    return {
      ...include,
      skipSteps: sortSkipSteps(skip),
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
