// Pure helpers for the merged Workflows page (WorkflowPanel): the Build/Run/
// Automate tab strip was collapsed into one page with two disclosures -
// "Steps" (workflow configuration - scope, step toggles, edit/duplicate/
// delete) and "Schedule & trigger" (ScheduleSection/TriggerSection). Both
// still need an initial open/closed state, and the old tri-state
// `ta-workflows-panel` value (possibly still sitting in a returning user's
// localStorage) is the only signal available for that on first load after
// this change ships. Kept as pure functions (not inline ternaries in
// WorkflowPanel) so the mapping is unit-testable on its own.

export interface WorkflowPanelDisclosureState {
  /** Whether the "Steps" disclosure (scope + step toggles + edit/duplicate/
   * delete) should start open. True only when the user's last-known panel
   * was "build" - they were actively configuring the workflow. */
  stepsOpen: boolean;
  /** Whether the "Schedule & trigger" disclosure should start open. True
   * only when the user's last-known panel was "automate". */
  automationOpen: boolean;
}

/**
 * Resolve the legacy `ta-workflows-panel` value ("build" | "run" | "automate"
 * | null | anything else) into the merged page's initial disclosure state.
 * "run" and any unrecognized/missing value resolve to both disclosures
 * closed, matching a fresh visit - the run form is the page's primary
 * content either way, so nothing is ever left blank.
 */
export function resolveWorkflowPanelDisclosures(
  stored: string | null
): WorkflowPanelDisclosureState {
  return {
    stepsOpen: stored === "build",
    automationOpen: stored === "automate",
  };
}

/**
 * Summarize a workflow's schedule/trigger counts for the collapsed
 * "Schedule & trigger" disclosure header, so the common case (nothing set
 * up) doesn't force the section open just to find that out.
 */
export function describeAutomationSummary(
  scheduleCount: number,
  triggerCount: number
): string {
  if (scheduleCount === 0 && triggerCount === 0) return "Not scheduled";
  const parts: string[] = [];
  if (scheduleCount > 0) {
    parts.push(`${scheduleCount} schedule${scheduleCount === 1 ? "" : "s"}`);
  }
  if (triggerCount > 0) {
    parts.push(`${triggerCount} trigger${triggerCount === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}
