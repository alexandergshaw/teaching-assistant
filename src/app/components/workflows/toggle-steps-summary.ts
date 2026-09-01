// Pure helper for the "Steps" disclosure's collapsed toggle label
// (WorkflowPanel.tsx) - B3(b) of the workflows/lecture UX audit.
//
// Before this fix the closed state read only "Steps (7/7 enabled)" - a count
// with no names, so an instructor could not tell what a workflow would
// actually DO without opening the disclosure first. This names the steps
// that will actually run (enabled ones - a disabled step never executes, so
// naming it here would misstate what Run does), capped so a workflow with
// many steps still gets a short, readable toggle label instead of one line
// per step.
//
// Kept pure (plain data in, string out) so vitest - node-env only, renders no
// component - can exercise the capping/pluralization rules directly.

const MAX_NAMED_STEPS = 3;

export interface ToggleStepSummaryInput {
  name: string;
  enabled: boolean;
}

/** Builds the "Steps (...)" toggle label. `steps` is parallel to
 * WorkflowPanel's own `expanded.steps` - one entry per already-expanded step,
 * carrying its display name (from the step registry) and whether the
 * instructor's own disabledSteps set currently disables it. */
export function describeStepsToggle(steps: ToggleStepSummaryInput[]): string {
  const totalCount = steps.length;
  if (totalCount === 0) return "Steps (none)";

  const enabledNames = steps.filter((s) => s.enabled).map((s) => s.name);
  const enabledCount = enabledNames.length;
  if (enabledCount === 0) return `Steps (0/${totalCount} enabled)`;

  const shown = enabledNames.slice(0, MAX_NAMED_STEPS);
  const remainder = enabledCount - shown.length;
  const namesText = remainder > 0 ? `${shown.join(", ")}, +${remainder} more` : shown.join(", ");

  return `Steps (${enabledCount}/${totalCount} enabled: ${namesText})`;
}
