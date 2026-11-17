/** The visual-inspection path is opt-in; accept both deployment flag conventions. */
export function notebookVisualsEnabled(): boolean {
  return process.env.GRADE_NOTEBOOK_VISUALS === "1" || process.env.GRADE_NOTEBOOK_VISUALS === "true";
}
