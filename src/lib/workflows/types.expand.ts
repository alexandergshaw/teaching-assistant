// Workflow step expansion (include-workflow resolution) and the per-user
// disabled-steps overlay, split out of types.ts (that file was over the
// 1000-line cap - see docs/REGRESSION.md's line-count discipline).
// Re-exported from types.ts under their original names, so every existing
// import site keeps resolving through "@/lib/workflows/types" unchanged.
import type { InputBinding, WorkflowDef, WorkflowStepConfig } from "@/lib/workflows/types";

/**
 * Flatten a workflow, replacing every "include-workflow" step with the
 * CURRENT steps of the workflow it references - dynamic composition: edits
 * to the source workflow apply wherever it is included.
 *
 * The returned steps' "step" bindings are in EXPANDED coordinates and can be
 * fed straight to the runner and to collectRuntimeFields. origins[i] is null
 * for the workflow's own steps and the source workflow's name for absorbed
 * steps. topIndices[i] is the index of def's own TOP-LEVEL step that expanded
 * step i came from (an include-workflow step's absorbed steps all report the
 * include step's own index in def) - used to map per-top-level-step UI state
 * (e.g. per-user enable/disable toggles) onto the expanded step list.
 */
export function expandWorkflowDef(
  def: WorkflowDef,
  lookup: (id: string) => WorkflowDef | undefined,
  visited: string[] = []
): {
  steps: WorkflowStepConfig[];
  origins: Array<string | null>;
  topIndices: number[];
} {
  const r = expandWithTopIndices(def, lookup, visited);
  return { steps: r.steps, origins: r.origins, topIndices: r.topIndices };
}

// Internal expansion that also reports, per flat step, the index of the
// def's TOP-LEVEL step it came from. skipSteps and remap keys are written
// in the source workflow's own top-level coordinates, so resolving them
// against an already-flattened source (nested includes expand first) needs
// this flat-index -> top-level-index mapping.
function expandWithTopIndices(
  def: WorkflowDef,
  lookup: (id: string) => WorkflowDef | undefined,
  visited: string[]
): {
  steps: WorkflowStepConfig[];
  origins: Array<string | null>;
  topIndices: number[];
} {
  if (visited.includes(def.id)) {
    throw new Error(
      `Workflow include cycle: ${[...visited, def.id].join(" -> ")}`
    );
  }

  const steps: WorkflowStepConfig[] = [];
  const origins: Array<string | null> = [];
  const topIndices: number[] = [];
  // def-local step index -> expanded index. Include steps never enter the
  // map: they expand to many steps and expose no outputs, so no def-local
  // binding can validly target one.
  const defToExpanded = new Map<number, number>();

  def.steps.forEach((step, defIndex) => {
    if (step.type !== "include-workflow") {
      // Own step: translate def-local "step" bindings to their expanded
      // positions (earlier def steps are already mapped by the walk).
      const bindings: Record<string, InputBinding> = {};
      for (const [key, b] of Object.entries(step.bindings)) {
        if (b.source === "step") {
          const mapped = defToExpanded.get(b.stepIndex);
          bindings[key] =
            mapped !== undefined ? { ...b, stepIndex: mapped } : b;
        } else {
          bindings[key] = b;
        }
      }
      let runIf = step.runIf;
      if (runIf && runIf.binding.source === "step") {
        const mapped = defToExpanded.get(runIf.binding.stepIndex);
        if (mapped !== undefined) runIf = { ...runIf, binding: { ...runIf.binding, stepIndex: mapped } };
      }
      defToExpanded.set(defIndex, steps.length);
      steps.push({ ...step, bindings, runIf });
      origins.push(null);
      topIndices.push(defIndex);
      return;
    }

    const include = step.include;
    if (!include) {
      // Malformed include with no target recorded: nothing to expand.
      return;
    }

    const source = lookup(include.workflowId);
    if (!source) {
      throw new Error(`Included workflow not found: ${include.workflowId}`);
    }

    // Expand the FULL source first so nested includes are already flat by
    // the time steps are dropped and rewired; expanded.topIndices maps each
    // flat step back to the source's own top-level index.
    const expanded = expandWithTopIndices(source, lookup, [
      ...visited,
      def.id,
    ]);

    const skip = new Set(include.skipSteps);

    // Flat source index -> final expanded index for the kept steps.
    const keptMap = new Map<number, number>();
    let nextIndex = steps.length;
    expanded.steps.forEach((_, flatIndex) => {
      if (!skip.has(expanded.topIndices[flatIndex])) {
        keptMap.set(flatIndex, nextIndex++);
      }
    });

    expanded.steps.forEach((s, flatIndex) => {
      if (skip.has(expanded.topIndices[flatIndex])) return;

      const bindings: Record<string, InputBinding> = {};
      for (const [key, b] of Object.entries(s.bindings)) {
        if (b.source !== "step") {
          bindings[key] = b;
          continue;
        }

        const kept = keptMap.get(b.stepIndex);
        if (kept !== undefined) {
          // Points at another kept source step: follow it to its new home.
          bindings[key] = { ...b, stepIndex: kept };
          continue;
        }

        // Points at a dropped step: the include's remap supplies the
        // replacement, written in the INCLUDING workflow's coordinates
        // (runtime/literal used as-is; "step" indices translated through
        // this walk's map). No remap entry falls back to a runtime field
        // named after the missing output.
        const droppedDefIndex = expanded.topIndices[b.stepIndex];
        const replacement = include.remap[`${droppedDefIndex}.${b.outputKey}`];
        if (!replacement) {
          bindings[key] = { source: "runtime", fieldKey: b.outputKey };
        } else if (replacement.source === "step") {
          const mapped = defToExpanded.get(replacement.stepIndex);
          bindings[key] =
            mapped !== undefined
              ? { ...replacement, stepIndex: mapped }
              : replacement;
        } else {
          bindings[key] = replacement;
        }
      }

      // bindOverrides apply AFTER the translation above: entries keyed
      // "<sourceTopIndex>.<inputKey>" replace this kept step's input
      // bindings. Values are written in the INCLUDING workflow's
      // coordinates - runtime/literal used as-is, "step" indices
      // translated through this walk's map exactly like remap values.
      const overrides = include.bindOverrides;
      if (overrides) {
        const sourceTopIndex = expanded.topIndices[flatIndex];
        for (const [oKey, oBinding] of Object.entries(overrides)) {
          const dot = oKey.indexOf(".");
          if (dot === -1) continue;
          if (Number(oKey.slice(0, dot)) !== sourceTopIndex) continue;
          const inputKey = oKey.slice(dot + 1);
          if (oBinding.source === "step") {
            const mapped = defToExpanded.get(oBinding.stepIndex);
            bindings[inputKey] =
              mapped !== undefined
                ? { ...oBinding, stepIndex: mapped }
                : oBinding;
          } else {
            bindings[inputKey] = oBinding;
          }
        }
      }

      let inclRunIf = s.runIf;
      if (inclRunIf && inclRunIf.binding.source === "step") {
        const keptTarget = keptMap.get(inclRunIf.binding.stepIndex);
        if (keptTarget !== undefined) {
          inclRunIf = { ...inclRunIf, binding: { ...inclRunIf.binding, stepIndex: keptTarget } };
        } else {
          // The gate targeted a step this include dropped; remap covers input
          // bindings only, not conditions - drop the gate so the step runs.
          inclRunIf = undefined;
        }
      }
      steps.push({ ...s, bindings, runIf: inclRunIf });
      origins.push(source.name);
      topIndices.push(defIndex);
    });
  });

  return { steps, origins, topIndices };
}

// Per-user, per-workflow overlay of disabled TOP-LEVEL step indices (see
// expandWorkflowDef's topIndices). Never edits the workflow def itself -
// presets and custom workflows both stay read-only; this is purely a local
// "skip this step for my runs" preference, mirroring ta-workflow-values-<id>.
const DISABLED_STEPS_PREFIX = "ta-workflow-disabled-";

// Pure parse step, split out from loadDisabledSteps so the JSON-shape
// handling (malformed JSON, non-array payloads, non-number entries) is
// testable without a DOM/localStorage-backed environment.
export function parseDisabledSteps(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return [];
  }
}

export function loadDisabledSteps(workflowId: string): number[] {
  if (typeof window === "undefined") return [];
  return parseDisabledSteps(
    localStorage.getItem(`${DISABLED_STEPS_PREFIX}${workflowId}`)
  );
}

export function saveDisabledSteps(workflowId: string, indices: number[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${DISABLED_STEPS_PREFIX}${workflowId}`,
      JSON.stringify(indices)
    );
  } catch {
    // Silently fail if localStorage is unavailable.
  }
}
