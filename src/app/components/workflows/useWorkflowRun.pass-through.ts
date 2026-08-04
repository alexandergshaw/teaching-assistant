// Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure,
// registry-helpers.ts) for the attended (in-browser) run loop.
//
// D2: resolvePassThroughOutputs and the run-ok verdict now have exactly ONE
// implementation each, shared with the unattended engine - see
// run-step-core.ts. This module is kept (rather than deleted and inlined
// into useWorkflowRun.ts) purely so that file's existing import site
// (`from "./useWorkflowRun.pass-through"`) and its own re-export of these two
// names (for pass-through-on-failure.test.ts) need no change - a pure,
// mechanical re-export, no behavior of its own.
import { resolvePassThroughOutputs, isRunOk } from "@/lib/workflows/run-step-core";

export { resolvePassThroughOutputs };

/**
 * Whether a course/institution group's step outcomes add up to a genuine
 * failure - the attended loop's own natural phrasing (inverted) for
 * isRunOk (run-step-core.ts), which answers "is the run clean". Exported
 * (alongside resolvePassThroughOutputs) so pass-through-on-failure.test.ts
 * can prove this is always the exact logical opposite of server-runner.ts's
 * own re-exported isRunOk for identical inputs - trivially true now that
 * both delegate to the SAME underlying algorithm, rather than something a
 * parity test has to keep re-proving against two independently-maintained
 * implementations.
 */
export function isGroupGenuineFailure(
  failedSteps: ReadonlySet<number>,
  disabledRunIndices: ReadonlySet<number>,
  skippedRunIndices: ReadonlySet<number>,
  passThroughFailures: ReadonlySet<number>
): boolean {
  return !isRunOk(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures);
}
