// INFER-AND-FLAG-SUBMISSION-NAME wave 2: the frozen visible-label literal for a
// single-file submission whose name could neither be read from the file name nor
// inferred from its content, and for which the instructor typed no label.
// Text, never colour alone (mirrors ungradedRowLabel.ts). Pure leaf: no React,
// no I/O, no module-scope mutable state.

export const UNRESOLVED_NAME_LABEL = "Name not found - add a label";

/** The visible flag text for a row whose student name is unresolved. */
export function describeUnresolvedNameLabel(): string {
  return UNRESOLVED_NAME_LABEL;
}
