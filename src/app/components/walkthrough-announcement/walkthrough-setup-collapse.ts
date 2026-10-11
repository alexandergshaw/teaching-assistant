// WALKTHROUGH-MIMIC-CHAT (M1): the walkthrough analog of the grading chat's
// sessionReady collapse. The setup fieldsets collapse to a one-line summary
// once a run is underway (capturing, or material from a finished capture is
// held), unless the instructor pressed Change setup. Pure and derived from
// in-memory run state, so it is never persisted (no ta- key).

export interface SetupCollapseInput {
  readonly capturing: boolean;
  readonly hasMaterial: boolean;
  readonly manuallyExpanded: boolean;
}

export function isSetupCollapsed(input: SetupCollapseInput): boolean {
  if (input.manuallyExpanded) return false;
  return input.capturing || input.hasMaterial;
}
