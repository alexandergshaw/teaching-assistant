// WORKFLOWS-COLLAPSE W2: Workflows and Automations left the Tools tab's
// Workflows section for the Automate container (manualView="artifact-design",
// inner nav automateView = templates | workflows | automations). The Workflows
// section no longer exists, so a returning user can carry the OLD location only
// as raw strings (URL params or localStorage values), and these helpers decide,
// from those raw strings, whether they name it and which sub-view they meant.
// Pure on purpose (node-env unit-testable), mirroring
// workflows-drafts-library-migration.ts.
//
// PRECEDENCE: the Drafts > Grades pointer and the Drafts -> Library pointer both
// ride on workflowsView="drafts" (the grades pointer additionally needs
// draftsView="grades"), so this leaf refuses to claim workflowsView="drafts"
// whatever draftsView is. A stale draftsView="grades" beside a workflowsView of
// "workflows" or "automations" is NOT a grades pointer and still migrates.
// Callers also consult resolveGradingPointer and the drafts pointer first.

/** The Automate sub-views a retired Workflows-section location can mean. */
export type LegacyAutomateTarget = "workflows" | "automations";

/** Does a (raw tab value, raw toolsSection) pair name the retired Tools >
 *  Workflows section? A raw toolsSection of "workflows" does; so does the
 *  retired tab value "workflows" unless an explicit "manual" section overrides
 *  it (the explicit param wins, exactly as it did before the section retired). */
export function isLegacyWorkflowsSection(rawTab: string | null, rawToolsSection: string | null): boolean {
  if (rawToolsSection === "manual") return false;
  return rawToolsSection === "workflows" || rawTab === "workflows";
}

/** The Automate sub-view a retired Workflows-section location means, or null
 *  when it is not one (not in the section, or workflowsView="drafts", which the
 *  grades / Library pointers own). draftsView is accepted for call-site symmetry
 *  but is not consulted: it only matters together with workflowsView="drafts".
 *  A missing or unrecognised workflowsView means "workflows", the section's old
 *  default. */
export function legacyAutomateView(
  inLegacyWorkflowsSection: boolean,
  workflowsView: string | null,
  _draftsView: string | null // eslint-disable-line @typescript-eslint/no-unused-vars -- accepted for call-site symmetry
): LegacyAutomateTarget | null {
  if (!inLegacyWorkflowsSection) return null;
  if (workflowsView === "drafts") return null;
  return workflowsView === "automations" ? "automations" : "workflows";
}
