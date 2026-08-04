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

  // def-local step id -> every def-local index that declares it (almost
  // always zero or one entry; more than one is an authoring duplicate,
  // tolerated here unless something actually references it - see
  // resolveStepId below). Built once, up front, so a forward id reference
  // (naming a step this same walk has not reached yet) can be told apart
  // from a genuinely unknown one regardless of processing order.
  const idPositions = new Map<string, number[]>();
  def.steps.forEach((s, i) => {
    if (s.id) {
      const positions = idPositions.get(s.id);
      if (positions) positions.push(i);
      else idPositions.set(s.id, [i]);
    }
  });

  // Resolve a `{source:"step", stepId}` reference made FROM def-local
  // position `atDefIndex` to its EXPANDED index - via defToExpanded, the
  // same map the stepIndex path uses, never the raw def.steps position (see
  // this file's "AC E2" tests for why the distinction matters the moment an
  // include precedes the target). Throws loudly rather than falling back
  // silently, per types.expand.step-ids.test.ts's "AC E2 - an unresolvable
  // id is LOUD" contract.
  function resolveStepId(stepId: string, atDefIndex: number): number {
    const positions = idPositions.get(stepId);
    if (!positions || positions.length === 0) {
      throw new Error(
        `Workflow "${def.id}": step ${atDefIndex} references unknown step id "${stepId}".`
      );
    }
    if (positions.length > 1) {
      throw new Error(
        `Workflow "${def.id}": step ${atDefIndex} references step id "${stepId}", which is ambiguous - more than one step in this workflow uses that id.`
      );
    }
    const targetDefIndex = positions[0];
    if (def.steps[targetDefIndex].type === "include-workflow") {
      throw new Error(
        `Workflow "${def.id}": step ${atDefIndex} references step id "${stepId}", which is an include-workflow step and exposes no outputs.`
      );
    }
    if (targetDefIndex >= atDefIndex) {
      throw new Error(
        `Workflow "${def.id}": step ${atDefIndex} references step id "${stepId}", which is not yet defined at that point - a forward reference; an id may only name an earlier step.`
      );
    }
    const mapped = defToExpanded.get(targetDefIndex);
    if (mapped === undefined) {
      // Defensive: every earlier, non-include own step has already been
      // recorded in defToExpanded by the time the walk reaches atDefIndex,
      // so this should be unreachable given the checks above.
      throw new Error(
        `Workflow "${def.id}": step ${atDefIndex} references step id "${stepId}", which could not be resolved.`
      );
    }
    return mapped;
  }

  // Lower a single binding: a stepId reference resolves (and throws) via
  // resolveStepId; a stepIndex reference keeps its existing silent-fallback
  // behavior (unmapped = leave as-is) so legacy positional defs, and the
  // include silent-fallback paths below, are unaffected. No-op for
  // runtime/literal bindings.
  function translateBinding(b: InputBinding, atDefIndex: number): InputBinding {
    if (b.source !== "step") return b;
    if ("stepId" in b) {
      return { source: "step", stepIndex: resolveStepId(b.stepId, atDefIndex), outputKey: b.outputKey };
    }
    const mapped = defToExpanded.get(b.stepIndex);
    return mapped !== undefined ? { ...b, stepIndex: mapped } : b;
  }

  def.steps.forEach((step, defIndex) => {
    if (step.type !== "include-workflow") {
      // Own step: translate def-local "step" bindings to their expanded
      // positions (earlier def steps are already mapped by the walk).
      const bindings: Record<string, InputBinding> = {};
      for (const [key, b] of Object.entries(step.bindings)) {
        bindings[key] = translateBinding(b, defIndex);
      }
      let runIf = step.runIf;
      if (runIf && runIf.binding.source === "step") {
        runIf = { ...runIf, binding: translateBinding(runIf.binding, defIndex) };
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

    // Resolve a step id against `source`'s own top-level steps - the ONE
    // namespace skipSteps id entries and remap/bindOverrides key prefixes
    // both share (see WorkflowStepConfig's own doc comment, types.ts). An
    // unresolvable or ambiguous id throws immediately, naming the id, this
    // including workflow, and the included one - `usage` distinguishes
    // which caller is reporting without duplicating the lookup/ambiguity
    // logic itself. Declared before `skip` below, and used to resolve it,
    // because skipSteps must be fully resolved to indices before keptMap is
    // built - keptMap's own kept/dropped split depends on it.
    function resolveSourceStepId(id: string, usage: string): number {
      const matches: number[] = [];
      source!.steps.forEach((s, i) => {
        if (s.id === id) matches.push(i);
      });
      if (matches.length === 0) {
        throw new Error(
          `Workflow "${def.id}": step ${defIndex} includes "${include!.workflowId}" and ${usage} references unknown step id "${id}" in "${include!.workflowId}".`
        );
      }
      if (matches.length > 1) {
        throw new Error(
          `Workflow "${def.id}": step ${defIndex} includes "${include!.workflowId}" and ${usage} references step id "${id}", which is ambiguous in "${include!.workflowId}" - more than one step there uses that id.`
        );
      }
      return matches[0];
    }

    // skipSteps: a NUMBER is `source`'s own top-level step INDEX, exactly as
    // before - used as-is, out-of-range silently ignored (a stored custom
    // workflow can contain a stale index and must keep expanding). A STRING
    // is ALWAYS an id (never sniffed, unlike a key prefix below - see
    // WorkflowStepConfig's own doc comment for why), resolved via
    // resolveSourceStepId above. Resolved into indices BEFORE keptMap: an
    // id must be translated to `source`'s coordinates first, since keptMap's
    // kept/dropped split reads `skip` against `expanded.topIndices`, which
    // are indices, never ids.
    const skip = new Set<number>(
      include.skipSteps.map((s) => (typeof s === "number" ? s : resolveSourceStepId(s, "its skipSteps entry")))
    );

    // Flat source index -> final expanded index for the kept steps.
    const keptMap = new Map<number, number>();
    let nextIndex = steps.length;
    expanded.steps.forEach((_, flatIndex) => {
      if (!skip.has(expanded.topIndices[flatIndex])) {
        keptMap.set(flatIndex, nextIndex++);
      }
    });

    // remap/bindOverrides keys are "<prefix>.<rest>" where prefix names a
    // top-level step of `source` - by index (backward compatible: a prefix
    // that parses as an integer is always an index) or, now, by that step's
    // own `id`, resolved via the SAME resolveSourceStepId above skipSteps
    // ids use. Resolved ONCE per include, up front: an id prefix that
    // matches no top-level step of `source` throws immediately, naming it -
    // matching stepId's own "unresolvable is loud" contract rather than the
    // silent "just never matches" fallback numeric keys have always had.
    // Per WorkflowStepConfig's own doc comment, an id naming an
    // include-workflow step of `source` resolves to THAT step's own index,
    // which - through the normal topIndices matching below - fans out to
    // every step it absorbs, exactly like the equivalent numeric key does
    // today; an id belonging to a step nested inside a FURTHER include is
    // not visible here at all (a different workflow's id namespace).
    function resolveIncludeKeyPrefix(key: string): { topIndex: number; rest: string } | null {
      const dot = key.indexOf(".");
      if (dot === -1) return null;
      const prefix = key.slice(0, dot);
      const rest = key.slice(dot + 1);
      const numeric = Number(prefix);
      if (Number.isInteger(numeric) && numeric >= 0) {
        return { topIndex: numeric, rest };
      }
      return { topIndex: resolveSourceStepId(prefix, `its key "${key}"`), rest };
    }

    const resolvedRemap = new Map<string, InputBinding>();
    for (const [rKey, rBinding] of Object.entries(include.remap)) {
      const parsed = resolveIncludeKeyPrefix(rKey);
      if (!parsed) continue;
      resolvedRemap.set(`${parsed.topIndex}.${parsed.rest}`, rBinding);
    }

    const resolvedBindOverrides: Array<{ topIndex: number; inputKey: string; binding: InputBinding }> = [];
    for (const [oKey, oBinding] of Object.entries(include.bindOverrides ?? {})) {
      const parsed = resolveIncludeKeyPrefix(oKey);
      if (!parsed) continue;
      resolvedBindOverrides.push({ topIndex: parsed.topIndex, inputKey: parsed.rest, binding: oBinding });
    }

    expanded.steps.forEach((s, flatIndex) => {
      if (skip.has(expanded.topIndices[flatIndex])) return;

      const bindings: Record<string, InputBinding> = {};
      for (const [key, b] of Object.entries(s.bindings)) {
        if (b.source !== "step") {
          bindings[key] = b;
          continue;
        }
        if (!("stepIndex" in b)) {
          // Unreachable in practice: `s` comes from the FULLY expanded
          // `source` (the recursive expandWithTopIndices call above already
          // lowered every stepId in its own scope), so a "step" binding
          // here always carries stepIndex by the time it reaches this
          // point. Fail loudly rather than silently mis-wiring if that
          // invariant is ever violated.
          throw new Error(
            `Workflow "${def.id}": step ${defIndex} inherited an unresolved step-id binding "${key}" from "${include.workflowId}".`
          );
        }

        const kept = keptMap.get(b.stepIndex);
        if (kept !== undefined) {
          // Points at another kept source step: follow it to its new home.
          bindings[key] = { ...b, stepIndex: kept };
          continue;
        }

        // Points at a dropped step: the include's remap supplies the
        // replacement, written in the INCLUDING workflow's coordinates
        // (runtime/literal used as-is; "step" indices/ids translated
        // through this walk's map). No remap entry falls back to a runtime
        // field named after the missing output.
        const droppedDefIndex = expanded.topIndices[b.stepIndex];
        const replacement = resolvedRemap.get(`${droppedDefIndex}.${b.outputKey}`);
        if (!replacement) {
          bindings[key] = { source: "runtime", fieldKey: b.outputKey };
        } else {
          bindings[key] = translateBinding(replacement, defIndex);
        }
      }

      // bindOverrides apply AFTER the translation above: entries keyed
      // "<sourceTopIndex>.<inputKey>" replace this kept step's input
      // bindings. Values are written in the INCLUDING workflow's
      // coordinates - runtime/literal used as-is, "step" indices/ids
      // translated through this walk's map exactly like remap values.
      const sourceTopIndex = expanded.topIndices[flatIndex];
      for (const o of resolvedBindOverrides) {
        if (o.topIndex !== sourceTopIndex) continue;
        bindings[o.inputKey] = translateBinding(o.binding, defIndex);
      }

      let inclRunIf = s.runIf;
      if (inclRunIf && inclRunIf.binding.source === "step") {
        if (!("stepIndex" in inclRunIf.binding)) {
          // Same unreachable-in-practice invariant as the bindings loop
          // above: a nested source's own runIf gate is always fully lowered
          // by the recursive expandWithTopIndices call before this point.
          throw new Error(
            `Workflow "${def.id}": step ${defIndex} inherited an unresolved step-id runIf gate from "${include.workflowId}".`
          );
        }
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
