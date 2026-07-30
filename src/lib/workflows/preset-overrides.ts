// Resolves a saved delta (PresetOverrideDelta) against the CURRENT code
// preset it targets, and computes that delta from an edited def - the two
// halves of "an edit to a preset persists against the preset's own id, and
// is re-applied over whatever the preset looks like today" (see
// docs/REGRESSION.md #153 for why this replaced the old copy-on-edit model,
// which froze a full snapshot and silently stopped receiving preset fixes).
//
// This module is the ONLY place that diffs an edited def against a preset or
// replays a delta onto one; every other consumer (expandWorkflowDef, the run
// engine, headless.ts, the Automations tab, run history) keeps operating on
// plain, fully-resolved WorkflowDef objects exactly as before this feature -
// see presets.ts's allWorkflows, the single choke point that calls
// resolvePresetOverride before anything downstream ever sees a def.

import type {
  InputBinding,
  PresetOverrideDelta,
  WorkflowDef,
  WorkflowStepConfig,
  WorkflowStepOverrideDelta,
} from "./types";

function bindingEquals(a: InputBinding, b: InputBinding | undefined): boolean {
  if (!b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function jsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Computes what changed between the CURRENT code preset and an edited
 * (fully materialized) def the builder produced - the delta that gets
 * stored instead of `edited.steps` wholesale. Pure; does not look at
 * `edited.presetOverride*` (the caller always re-diffs from scratch, so a
 * stale or partially-applied old delta can never linger).
 */
export function diffAgainstPreset(
  preset: WorkflowDef,
  edited: WorkflowDef
): PresetOverrideDelta {
  const name = edited.name !== preset.name ? edited.name : undefined;
  const description =
    edited.description !== preset.description ? edited.description : undefined;

  const shapeMatches =
    edited.steps.length === preset.steps.length &&
    edited.steps.every((step, i) => step.type === preset.steps[i].type);

  if (!shapeMatches) {
    // Structural edit (added/removed/reordered steps): a positional delta
    // can no longer be trusted, so the full step list freezes - see
    // WorkflowStepOverrideDelta's doc comment. `stepOverrides` is
    // deliberately omitted; resolvePresetOverride ignores it once diverged.
    return { name, description, diverged: true };
  }

  const stepOverrides: Record<number, WorkflowStepOverrideDelta> = {};
  edited.steps.forEach((step, i) => {
    const base = preset.steps[i];
    const bindings: Record<string, InputBinding> = {};
    // Walks EDITED's own keys, not a union with base's: every def that
    // actually passes through here comes from normalizeBindings
    // (builder-shared.ts), which always fills one binding per stepDef
    // input key for both the preset step and the edited step, so the two
    // key sets already match - there is no "key present in the preset but
    // missing from edited" case to also walk.
    for (const [key, binding] of Object.entries(step.bindings)) {
      if (!bindingEquals(binding, base.bindings[key])) bindings[key] = binding;
    }

    const runIfChanged = !jsonEquals(step.runIf, base.runIf);
    const includeChanged =
      step.type === "include-workflow" && !jsonEquals(step.include, base.include);

    if (Object.keys(bindings).length === 0 && !runIfChanged && !includeChanged) {
      return;
    }

    stepOverrides[i] = {
      expectedType: step.type,
      ...(Object.keys(bindings).length > 0 ? { bindings } : {}),
      ...(runIfChanged ? { runIf: step.runIf ?? null } : {}),
      ...(includeChanged ? { include: step.include } : {}),
    };
  });

  return {
    name,
    description,
    diverged: false,
    ...(Object.keys(stepOverrides).length > 0 ? { stepOverrides } : {}),
  };
}

/**
 * Applies a stored delta over the CURRENT code preset, producing the same
 * shape of WorkflowDef every other part of the app already knows how to run
 * (expandWorkflowDef, collectRuntimeFields, the run engine, headless
 * checks, ...) - resolution happens ONCE here, not spread across those
 * consumers. `stored` supplies the delta plus whatever is not part of the
 * delta (scope, and - only while diverged - the frozen full step list).
 */
export function resolvePresetOverride(
  preset: WorkflowDef,
  stored: WorkflowDef
): WorkflowDef {
  const delta = stored.presetOverrideDelta;

  if (!delta) {
    // Defensive: a row sharing a preset's id but carrying no delta should
    // never happen via this app's own write path (toStoredDef always
    // attaches one for a preset id) - treat it as fully diverged rather
    // than silently discarding whatever steps it does carry.
    return {
      ...stored,
      preset: true,
      presetOverrideDelta: undefined,
      presetOverride: { diverged: true },
    };
  }

  if (delta.diverged) {
    return {
      ...preset,
      name: delta.name ?? preset.name,
      description: delta.description ?? preset.description,
      steps: stored.steps,
      scope: stored.scope,
      preset: true,
      presetOverride: { diverged: true },
    };
  }

  const steps: WorkflowStepConfig[] = preset.steps.map((step, i) => {
    const ov = delta.stepOverrides?.[i];
    // Type mismatch = the preset changed shape upstream since this override
    // was saved; skip rather than misapply to a step it was never written
    // for (mirrors expandWorkflowDef's include.remap "skip on a miss").
    if (!ov || ov.expectedType !== step.type) return step;
    return {
      ...step,
      bindings: { ...step.bindings, ...(ov.bindings ?? {}) },
      ...(ov.runIf !== undefined ? { runIf: ov.runIf ?? undefined } : {}),
      ...(ov.include !== undefined ? { include: ov.include } : {}),
    };
  });

  return {
    ...preset,
    name: delta.name ?? preset.name,
    description: delta.description ?? preset.description,
    steps,
    scope: stored.scope,
    preset: true,
    presetOverride: { diverged: false },
  };
}

/**
 * Builds the shape to actually PERSIST for an edited def: when `edited.id`
 * is a code preset's id, the raw delta over that preset (plus, only while
 * diverged, the frozen full step list `steps` carries); otherwise an
 * ordinary plain custom workflow, unchanged from before this feature -
 * `getPreset` returning undefined for every non-preset id (all of them
 * `crypto.randomUUID()` strings) is what keeps AC5's from-scratch custom
 * workflows on the exact same path they were always on.
 */
export function toStoredDef(
  edited: WorkflowDef,
  getPreset: (id: string) => WorkflowDef | undefined
): WorkflowDef {
  const preset = getPreset(edited.id);
  if (!preset) {
    // A plain custom workflow row must never persist override metadata (it
    // is meaningless without a preset id) - rebuild explicitly rather than
    // spread-and-strip, in case a caller passed in a previously-resolved def
    // that carried `presetOverrideDelta`/`presetOverride` from elsewhere.
    return {
      id: edited.id,
      name: edited.name,
      description: edited.description,
      steps: edited.steps,
      ...(edited.scope ? { scope: edited.scope } : {}),
      ...(edited.category ? { category: edited.category } : {}),
    };
  }

  const delta = diffAgainstPreset(preset, edited);
  return {
    id: edited.id,
    name: edited.name,
    description: edited.description,
    preset: true,
    steps: delta.diverged ? edited.steps : [],
    scope: edited.scope,
    presetOverrideDelta: delta,
  };
}
