// docs/recording-controls-ux-acceptance-criteria.md CC1: "The one legal
// spelling of a state-dependent primary" - after this group the literal
// `? "contained" : "outlined"` exists here and nowhere else in section 4's
// file lists (the cross-file canary that proves that is frozen by the
// orchestrator after wave 1, once every consumer is on disk).
export function variantFor(primary: boolean): "contained" | "outlined" {
  return primary ? "contained" : "outlined";
}
