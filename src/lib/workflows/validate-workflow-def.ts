// Build-time validator for WorkflowDef step wiring.
//
// Workflow presets wire steps together POSITIONALLY: a `{source:"step",
// stepIndex, outputKey}` binding names an earlier step by its INDEX, and an
// include-workflow step's `remap`/`bindOverrides` keys ("6.selected") name a
// step by the INDEX it currently sits at in the included workflow. None of
// that is checked by the type system - a preset can silently rot as steps
// are inserted, removed, or reordered.
//
// types.expand.ts (expandWorkflowDef / expandWithTopIndices) resolves all of
// this with SILENT FALLBACKS, by design: run-time expansion must never
// crash a course build over a wiring mistake. This module is the build-time
// gate that makes those same mistakes LOUD. It is a pure REPORTER - it never
// throws and never mutates - and it must not import anything that reaches
// next/headers or Supabase, so callers (tests, a future lint/CI step) can
// invoke it with nothing but plain data.
//
// It stays intentionally decoupled from the registry and from presets.ts:
// both `lookupShape` and `lookupWorkflow` are injected, mirroring the same
// dependency-injection escape hatch expandWorkflowDef already uses for its
// `lookup` parameter.
import type { InputBinding, WorkflowDef, WorkflowStepConfig } from "@/lib/workflows/types";

/** The minimal step shape the validator needs: just enough to check that a
 * binding's key/output actually exists on the step it targets. Deliberately
 * narrower than the registry's real StepDefinition so this module never
 * needs to import it. */
export interface StepShape {
  inputs: ReadonlyArray<{ key: string }>;
  outputs: ReadonlyArray<{ key: string }>;
}

export interface ValidateOptions {
  /** Resolve a registry step type to its declared inputs/outputs. Returns
   * undefined for an unknown type (including "include-workflow", which the
   * caller should never be asked to resolve - it is handled specially). */
  lookupShape: (type: string) => StepShape | undefined;
  /** Resolve a workflow id (preset or custom) to its current definition.
   * Returns undefined for an unknown id. */
  lookupWorkflow: (id: string) => WorkflowDef | undefined;
}

/** One code per silent-fallback path in types.expand.ts, plus the ordinary
 * authoring mistakes (unknown type, typo'd input key) that would otherwise
 * only surface as a step quietly doing nothing at run time. */
export type WorkflowDefIssueCode =
  | "unknown-step-type"
  | "step-binding-out-of-range"
  | "step-binding-forward-reference"
  | "step-binding-unknown-output"
  | "binding-key-not-an-input"
  | "include-unknown-workflow"
  | "include-skip-out-of-range"
  | "remap-key-not-a-dropped-step"
  | "remap-key-unknown-output"
  | "override-key-no-such-step"
  | "override-key-not-an-input"
  | "runif-target-dropped";

export interface WorkflowDefIssue {
  severity: "error" | "warning";
  code: WorkflowDefIssueCode;
  message: string;
  /** The def-local top-level step index this issue is about - the step that
   * HOLDS the bad binding/include, not (necessarily) the step it targets. */
  stepIndex?: number;
  /** The binding key, or the dotted remap/bindOverride key, this issue is about. */
  key?: string;
}

function issue(
  issues: WorkflowDefIssue[],
  code: WorkflowDefIssueCode,
  message: string,
  stepIndex?: number,
  key?: string
): void {
  issues.push({ severity: "error", code, message, stepIndex, key });
}

/**
 * Split a positional "N.rest" key (a remap or bindOverride key) into its
 * numeric top-level index and the trailing output/input key. Mirrors
 * types.expand.ts's own `oKey.indexOf(".")` parsing exactly - only the
 * FIRST dot is a delimiter, so an input/output key may itself never contain
 * one (none in this codebase do).
 */
function parseDottedKey(key: string): { topIndex: number; rest: string } | null {
  const dot = key.indexOf(".");
  if (dot === -1) return null;
  const topIndex = Number(key.slice(0, dot));
  if (!Number.isInteger(topIndex) || topIndex < 0) return null;
  return { topIndex, rest: key.slice(dot + 1) };
}

/**
 * Validate a single `{source:"step", ...}` binding that lives at def-local
 * top-level position `atDefIndex` - either an own step's own binding, or a
 * remap/bindOverride VALUE (which, per WorkflowStepConfig's own doc comment,
 * is written in the including workflow's coordinates and refers to the
 * including workflow's own EARLIER steps, exactly like an own step's
 * binding does relative to its own position). No-op for runtime/literal
 * bindings.
 */
function validateBindingValue(
  def: WorkflowDef,
  binding: InputBinding,
  atDefIndex: number,
  opts: ValidateOptions,
  issues: WorkflowDefIssue[],
  key: string
): void {
  if (binding.source !== "step") return;
  const { stepIndex, outputKey } = binding;
  if (stepIndex < 0 || stepIndex >= def.steps.length) {
    issue(
      issues,
      "step-binding-out-of-range",
      `Step ${atDefIndex} binding "${key}" references step ${stepIndex}, which is out of range (workflow has ${def.steps.length} step(s)).`,
      atDefIndex,
      key
    );
    return;
  }
  if (stepIndex >= atDefIndex) {
    issue(
      issues,
      "step-binding-forward-reference",
      `Step ${atDefIndex} binding "${key}" references step ${stepIndex}, which is not strictly earlier - a step may only read an earlier step's output.`,
      atDefIndex,
      key
    );
    return;
  }
  const target = def.steps[stepIndex];
  if (target.type === "include-workflow") {
    // An include-workflow step expands to many steps and exposes no single
    // output - defToExpanded (types.expand.ts) never maps it, so a def-local
    // "step" binding pointing here would silently keep its stale index at
    // run time. Report it the same way as a genuinely missing output.
    issue(
      issues,
      "step-binding-unknown-output",
      `Step ${atDefIndex} binding "${key}" references step ${stepIndex}, which is an include-workflow step and exposes no outputs.`,
      atDefIndex,
      key
    );
    return;
  }
  const shape = opts.lookupShape(target.type);
  if (shape && !shape.outputs.some((o) => o.key === outputKey)) {
    issue(
      issues,
      "step-binding-unknown-output",
      `Step ${atDefIndex} binding "${key}" references step ${stepIndex}'s output "${outputKey}", which type "${target.type}" does not declare.`,
      atDefIndex,
      key
    );
  }
}

/**
 * A faithful, side-effect-free mirror of types.expand.ts's
 * expandWithTopIndices - tracking just enough (step type, the top-level
 * index it came from, and its runIf gate) to answer "what is really at
 * position N" and "does this kept step's gate point at a step this
 * inclusion just dropped", without needing full binding translation. Two
 * results in this file need exactly this: resolveIncludeKeyTargets's
 * positional resolution, and validateWorkflowDef's runif-target-dropped
 * check.
 *
 * Returns null on an include cycle (mirrors expandWithTopIndices's cycle
 * detection, but reports instead of throwing) or when a nested include's
 * source workflow doesn't resolve - the caller reports THAT specific
 * include's own issue where it is directly validated; here it just means
 * "nothing to contribute from this branch", not "abort everything".
 */
interface MirrorResult {
  types: string[];
  topIndices: number[];
  runIfs: Array<{ binding: InputBinding; expected: boolean } | undefined>;
}

function mirrorExpand(def: WorkflowDef, opts: ValidateOptions, visited: string[]): MirrorResult | null {
  if (visited.includes(def.id)) return null;

  const types: string[] = [];
  const topIndices: number[] = [];
  const runIfs: Array<{ binding: InputBinding; expected: boolean } | undefined> = [];
  const defToExpanded = new Map<number, number>();

  def.steps.forEach((step, defIndex) => {
    if (step.type !== "include-workflow") {
      let runIf = step.runIf;
      if (runIf && runIf.binding.source === "step") {
        const mapped = defToExpanded.get(runIf.binding.stepIndex);
        if (mapped !== undefined) {
          runIf = { ...runIf, binding: { ...runIf.binding, stepIndex: mapped } };
        }
      }
      defToExpanded.set(defIndex, types.length);
      types.push(step.type);
      topIndices.push(defIndex);
      runIfs.push(runIf);
      return;
    }

    const include = step.include;
    if (!include) return;
    const source = opts.lookupWorkflow(include.workflowId);
    if (!source) return;
    const nested = mirrorExpand(source, opts, [...visited, def.id]);
    if (!nested) return;

    const skip = new Set(include.skipSteps ?? []);
    const keptMap = new Map<number, number>();
    let nextIndex = types.length;
    nested.types.forEach((_, flatIndex) => {
      if (!skip.has(nested.topIndices[flatIndex])) keptMap.set(flatIndex, nextIndex++);
    });

    nested.types.forEach((t, flatIndex) => {
      if (skip.has(nested.topIndices[flatIndex])) return;
      let runIf = nested.runIfs[flatIndex];
      if (runIf && runIf.binding.source === "step") {
        const keptTarget = keptMap.get(runIf.binding.stepIndex);
        if (keptTarget !== undefined) {
          runIf = { ...runIf, binding: { ...runIf.binding, stepIndex: keptTarget } };
        } else {
          // The gate targets a step THIS inclusion dropped - the real
          // expander deletes the gate here (types.expand.ts:186-189); the
          // validator's own top-level check below is what turns that
          // deletion into a reported issue instead of a silent one.
          runIf = undefined;
        }
      }
      types.push(t);
      topIndices.push(defIndex);
      runIfs.push(runIf);
    });
  });

  return { types, topIndices, runIfs };
}

/** Every step type at top-level position `topIndex` of `mirror` - possibly
 * more than one when that position is itself (transitively) an
 * include-workflow step, whose absorbed steps all report their enclosing
 * include step's own index (see mirrorExpand / expandWithTopIndices). */
function typesAt(mirror: MirrorResult, topIndex: number): string[] {
  const found: string[] = [];
  mirror.topIndices.forEach((ti, i) => {
    if (ti === topIndex) found.push(mirror.types[i]);
  });
  return found;
}

function validateInclude(
  def: WorkflowDef,
  step: WorkflowStepConfig,
  defIndex: number,
  opts: ValidateOptions,
  issues: WorkflowDefIssue[]
): void {
  const include = step.include;
  if (!include) return; // Malformed: nothing to expand, nothing further to check.

  const source = opts.lookupWorkflow(include.workflowId);
  if (!source) {
    issue(
      issues,
      "include-unknown-workflow",
      `Step ${defIndex} includes unknown workflow "${include.workflowId}".`,
      defIndex,
      include.workflowId
    );
    return;
  }

  const skipSteps = include.skipSteps ?? [];
  for (const s of skipSteps) {
    if (!Number.isInteger(s) || s < 0 || s >= source.steps.length) {
      issue(
        issues,
        "include-skip-out-of-range",
        `Step ${defIndex} skips step ${s} of "${include.workflowId}", which is out of range (that workflow has ${source.steps.length} step(s)).`,
        defIndex,
        String(s)
      );
    }
  }

  const skipSet = new Set(skipSteps);
  // Full recursive expansion of the SOURCE workflow alone (fan-out through
  // its own nested includes already resolved) - the same shape
  // expandWithTopIndices' `expanded` local holds. null only on a cycle.
  const nested = mirrorExpand(source, opts, [def.id]);

  for (const [key, value] of Object.entries(include.remap ?? {})) {
    const parsed = parseDottedKey(key);
    if (parsed) {
      const { topIndex, rest: outputKey } = parsed;
      if (!skipSet.has(topIndex)) {
        issue(
          issues,
          "remap-key-not-a-dropped-step",
          `Step ${defIndex} remap key "${key}" names step ${topIndex} of "${include.workflowId}", which is not in skipSteps - remap only replaces a DROPPED step's output.`,
          defIndex,
          key
        );
      } else if (nested) {
        const candidates = typesAt(nested, topIndex);
        const anyDeclares = candidates.some((t) => opts.lookupShape(t)?.outputs.some((o) => o.key === outputKey));
        if (candidates.length > 0 && !anyDeclares) {
          issue(
            issues,
            "remap-key-unknown-output",
            `Step ${defIndex} remap key "${key}": dropped step ${topIndex} of "${include.workflowId}" (type(s) ${candidates.join(", ")}) declares no output "${outputKey}".`,
            defIndex,
            key
          );
        }
      }
    }
    validateBindingValue(def, value, defIndex, opts, issues, key);
  }

  for (const [key, value] of Object.entries(include.bindOverrides ?? {})) {
    const parsed = parseDottedKey(key);
    if (parsed) {
      const { topIndex, rest: inputKey } = parsed;
      if (topIndex < 0 || topIndex >= source.steps.length) {
        issue(
          issues,
          "override-key-no-such-step",
          `Step ${defIndex} bindOverride key "${key}" names step ${topIndex} of "${include.workflowId}", which does not have a step at that index (${source.steps.length} step(s)).`,
          defIndex,
          key
        );
      } else if (nested) {
        const candidates = typesAt(nested, topIndex);
        const anyDeclares = candidates.some((t) => opts.lookupShape(t)?.inputs.some((i) => i.key === inputKey));
        if (candidates.length > 0 && !anyDeclares) {
          issue(
            issues,
            "override-key-not-an-input",
            `Step ${defIndex} bindOverride key "${key}": step ${topIndex} of "${include.workflowId}" (type(s) ${candidates.join(", ")}) declares no input "${inputKey}".`,
            defIndex,
            key
          );
        }
      }
    }
    validateBindingValue(def, value, defIndex, opts, issues, key);
  }

  if (nested) {
    nested.types.forEach((_, flatIndex) => {
      const ownTopIndex = nested.topIndices[flatIndex];
      if (skipSet.has(ownTopIndex)) return; // Dropped itself - its gate is moot.
      const runIf = nested.runIfs[flatIndex];
      if (!runIf || runIf.binding.source !== "step") return;
      const targetTopIndex = nested.topIndices[runIf.binding.stepIndex];
      if (targetTopIndex !== undefined && skipSet.has(targetTopIndex)) {
        issue(
          issues,
          "runif-target-dropped",
          `Step ${defIndex} keeps step ${ownTopIndex} of "${include.workflowId}", whose runIf gate targets step ${targetTopIndex}, which this inclusion drops - the gate is silently deleted and the step runs unconditionally.`,
          defIndex,
          String(ownTopIndex)
        );
      }
    });
  }
}

/**
 * Validate a WorkflowDef's own step wiring: unknown step types, "step"
 * bindings that are out of range, self/forward-referencing, or point at an
 * undeclared output; input keys with no matching declared input; and every
 * include-workflow step's skipSteps/remap/bindOverrides/runIf-under-drop
 * correctness. Pure reporter - never throws, never mutates `def`.
 *
 * Deliberately shallow: it validates `def`'s OWN steps and its OWN
 * include directives' structural correctness against the CURRENT shape of
 * whatever they include, but does not recurse into validating an included
 * workflow's own internal wiring - that workflow gets validated on its own
 * terms wherever it itself is checked (see presets.include-key-targets.test.ts,
 * which validates every entry in PRESET_WORKFLOWS independently).
 */
export function validateWorkflowDef(def: WorkflowDef, opts: ValidateOptions): WorkflowDefIssue[] {
  const issues: WorkflowDefIssue[] = [];
  try {
    def.steps.forEach((step, defIndex) => {
      if (step.type === "include-workflow") {
        validateInclude(def, step, defIndex, opts, issues);
        return;
      }

      const shape = opts.lookupShape(step.type);
      if (!shape) {
        issue(issues, "unknown-step-type", `Step ${defIndex} has unknown type "${step.type}".`, defIndex, step.type);
      }

      for (const [key, binding] of Object.entries(step.bindings ?? {})) {
        if (shape && !shape.inputs.some((i) => i.key === key)) {
          issue(
            issues,
            "binding-key-not-an-input",
            `Step ${defIndex} (type "${step.type}") binds "${key}", which is not a declared input - the binding is silently discarded at run time.`,
            defIndex,
            key
          );
        }
        validateBindingValue(def, binding, defIndex, opts, issues, key);
      }

      if (step.runIf) {
        validateBindingValue(def, step.runIf.binding, defIndex, opts, issues, "runIf");
      }
    });
  } catch {
    // Belt-and-suspenders: this function must never throw. Every code path
    // above is already defensive, but a reporter that crashes on data it
    // hasn't seen yet is worse than one that under-reports.
  }
  return issues;
}

/**
 * For every dotted "N.key" entry in `def`'s OWN top-level include-workflow
 * steps' `remap` and `bindOverrides`, resolve which step TYPE(s) it
 * currently lands on - recursing through nested includes the same way
 * expandWithTopIndices does, so a key targeting a position that is itself
 * an include-workflow step fans out to every step it absorbs.
 *
 * This is the identity check the plain "does step N declare an input
 * called key" guard cannot do: two different step types can declare the
 * same input name, so an input-existence check stays green even after a
 * step is inserted ahead of the real target and silently steals the key's
 * meaning. Resolving to the target's TYPE is what turns that red.
 *
 * Purely positional - does not filter by this inclusion's own skipSteps, so
 * a key can resolve to a real type set even when it happens to target a
 * step this same inclusion drops (that mismatch is reported separately, as
 * an error, by validateWorkflowDef).
 */
export function resolveIncludeKeyTargets(
  def: WorkflowDef,
  opts: ValidateOptions
): Array<{ key: string; kind: "remap" | "bindOverride"; targetTypes: string[] }> {
  const results: Array<{ key: string; kind: "remap" | "bindOverride"; targetTypes: string[] }> = [];
  try {
    for (const step of def.steps) {
      if (step.type !== "include-workflow" || !step.include) continue;
      const source = opts.lookupWorkflow(step.include.workflowId);
      const mirror = source ? mirrorExpand(source, opts, [def.id]) : null;

      for (const key of Object.keys(step.include.remap ?? {})) {
        results.push({ key, kind: "remap", targetTypes: resolveKeyTypes(mirror, key) });
      }
      for (const key of Object.keys(step.include.bindOverrides ?? {})) {
        results.push({ key, kind: "bindOverride", targetTypes: resolveKeyTypes(mirror, key) });
      }
    }
  } catch {
    return [];
  }
  return results;
}

function resolveKeyTypes(mirror: MirrorResult | null, key: string): string[] {
  if (!mirror) return [];
  const parsed = parseDottedKey(key);
  if (!parsed) return [];
  return typesAt(mirror, parsed.topIndex);
}
