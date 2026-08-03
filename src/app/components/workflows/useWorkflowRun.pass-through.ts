// Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure,
// registry-helpers.ts) for the attended (in-browser) run loop. Pulled out of
// useWorkflowRun.ts (kept under this project's 1000-line cap) - a pure,
// mechanical relocation, no behavior change. See each function's own doc
// comment below for the full reasoning; pass-through-on-failure.test.ts
// (src/lib/workflows/) imports both of these via useWorkflowRun.ts's own
// re-export, so that import site needed no change.
import type { InputBinding } from "@/lib/workflows/types";

/**
 * Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure,
 * registry-helpers.ts). This is the attended run loop's own copy of the
 * SAME algorithm server-runner.ts's runExpandedBodyOnce implements as its
 * own exported resolvePassThroughOutputs (see that function's doc comment
 * for the full reasoning, including why this reads the input's BINDING
 * rather than the step's resolvedInputs bag) - the two run loops share no
 * code (useWorkflowRun.ts is "use client"; server-runner.ts must stay free
 * of client-only/DOM code), so each keeps its own implementation, and
 * pass-through-parity.test.ts proves the two agree on every scenario.
 *
 * Pure (no closures, every dependency an explicit parameter) and exported
 * specifically so it is unit-testable without rendering useWorkflowRun.ts's
 * hook - this repo's vitest setup has no jsdom/React Testing Library (see
 * that test file's own header).
 */
export function resolvePassThroughOutputs(
  passThroughOnFailure: Record<string, string> | undefined,
  bindings: Record<string, InputBinding>,
  failedSteps: ReadonlySet<number>,
  stepOutputs: ReadonlyArray<Record<string, unknown> | undefined>
): { passedThrough: boolean; outputs: Record<string, unknown> } {
  const outputs: Record<string, unknown> = {};
  let passedThrough = false;
  if (!passThroughOnFailure) {
    return { passedThrough, outputs };
  }
  for (const [outputKey, inputKey] of Object.entries(passThroughOnFailure)) {
    const binding = bindings[inputKey];
    if (!binding || binding.source !== "step") continue;
    // The step this input binds to must itself have genuinely succeeded (or
    // itself passed through - a passed-through step is deliberately never
    // added to failedSteps, which is exactly what makes ITS OWN output
    // resolvable here) - never salvage a value out of a step that never
    // actually produced one.
    if (failedSteps.has(binding.stepIndex)) continue;
    const value = stepOutputs[binding.stepIndex]?.[binding.outputKey];
    if (value === undefined) continue;
    outputs[outputKey] = value;
    passedThrough = true;
  }
  return { passedThrough, outputs };
}

/**
 * Whether a course/institution group's step outcomes add up to a genuine
 * failure: EITHER at least one step in `failedSteps` is neither disabled nor
 * gate-skipped (failedSteps is always a superset of disabledRunIndices union
 * skippedRunIndices - see useWorkflowRun.ts's own catch/disabled/runIf
 * branches - so a size comparison is enough, no set difference needed), OR
 * at least one step passed through a failure (StepDefinition.
 * passThroughOnFailure / resolvePassThroughOutputs above). A pass-through
 * failure is deliberately never added to `failedSteps` (that is what stops
 * it from cascading to dependents), so without the second condition this
 * would report a group clean even though a generator genuinely failed - a
 * run that lost a deliverable must not report ok. Exported (alongside
 * resolvePassThroughOutputs) so pass-through-parity.test.ts can prove this
 * agrees with server-runner.ts's own isRunOk, which encodes the same
 * semantics inverted (that loop tracks "ok", this one tracks "genuine
 * failure") for its own unattended-loop reasons.
 */
export function isGroupGenuineFailure(
  failedSteps: ReadonlySet<number>,
  disabledRunIndices: ReadonlySet<number>,
  skippedRunIndices: ReadonlySet<number>,
  passThroughFailures: ReadonlySet<number>
): boolean {
  return (
    failedSteps.size > disabledRunIndices.size + skippedRunIndices.size ||
    passThroughFailures.size > 0
  );
}
