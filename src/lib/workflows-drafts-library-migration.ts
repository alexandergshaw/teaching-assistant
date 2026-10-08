// WORKFLOWS-COLLAPSE W1: Drafts left Tools > Workflows for Library > Drafts.
//
// A returning user can carry the OLD location as raw strings (URL params or
// localStorage values), and "drafts" is no longer a WorkflowsView member, so
// those strings are migration INPUTS only. This leaf decides, from the three
// raw strings, whether they name the old Drafts home. Pure on purpose
// (node-env unit-testable), mirroring rec-view-migration.ts.
//
// PRECEDENCE, the one rule that fails silently if wrong: the pre-existing
// Drafts > Grades pointer (workflowsView="drafts" + draftsView="grades") is
// ALSO a "workflowsView=drafts" value, but its target is Tools > Grading >
// Drafted Grades. The grades pointer therefore wins, and this leaf refuses to
// claim it: draftsView === "grades" returns false here, and every caller also
// checks resolveGradingPointer first (url-state.ts) so a manualView-keyed
// grading pointer wins too.

/** True when the raw strings name the retired Tools > Workflows > Drafts
 *  location and are NOT the Drafts > Grades pointer. `toolsSection` is the
 *  EFFECTIVE section (an explicit param, or the one a retired tab value such
 *  as "?tab=workflows" implies). */
export function isLegacyWorkflowsDrafts(
  toolsSection: string | null,
  workflowsView: string | null,
  draftsView: string | null
): boolean {
  if (draftsView === "grades") return false;
  return toolsSection === "workflows" && workflowsView === "drafts";
}
