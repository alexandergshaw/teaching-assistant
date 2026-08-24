// Shared pure helper for every UI caller of createCourseAssignmentAction
// (useAddModuleItem.ts, useNewAssignmentForm.ts) that turns its result into
// the note the UI shows.
//
// canvas-modules.ts's createCourseAssignmentAction header comment documents
// the C5 fix: a module-link failure no longer discards the created
// assignment's id - it returns `{ id, name, htmlUrl, addedToModule: false,
// linkError }`, a SUCCESS-SHAPED object (no `error` key). Step-11's own
// regression pass found that every caller which only ever tested
// `"error" in result` therefore started reporting success on an orphaned
// assignment. THE INVARIANT this helper exists to hold in exactly one place
// for both UI callers: a failed module link is never shown with kind
// "success" - the created assignment's id is surfaced instead, so a human
// can find the orphan in Canvas (REGRESSION.md entry 258 check 11's
// doctrine: report the orphan by id, never auto-delete it).
//
// The discriminator is `linkError !== undefined`, NOT `!addedToModule`:
// `addedToModule` is also `false` when the caller passed no `moduleId` at
// all (useNewAssignmentForm.ts's "no module selected" case, a legitimate
// no-op, not a failure) - createCourseAssignmentAction only ever sets
// `linkError` inside the catch around an ATTEMPTED link (canvas-modules.ts's
// `if (moduleId !== null) { try { ... } catch { linkError = ... } }`), so it
// is the only reliable "a link was tried and failed" signal.
export type CreateCourseAssignmentResult =
  | { id: number; name: string; htmlUrl: string; addedToModule: boolean; linkError?: string }
  | { error: string };

export interface AssignmentCreateNote {
  kind: "success" | "error";
  text: string;
}

/**
 * `successText` renders the caller's own success wording (the two callers
 * word it slightly differently - "Created X in <module>." vs "Created X and
 * added it to the module.") from the full success payload, so it can decide
 * from `addedToModule` whether a module link happened at all. The orphan and
 * outright-failure wordings are shared here so both callers stay honest the
 * same way.
 */
export function describeAssignmentCreateOutcome(
  r: CreateCourseAssignmentResult,
  successText: (r: { id: number; name: string; htmlUrl: string; addedToModule: boolean }) => string
): AssignmentCreateNote {
  if ("error" in r) return { kind: "error", text: r.error };
  if (r.linkError !== undefined) {
    return {
      kind: "error",
      text: `Created "${r.name}" (Canvas assignment id ${r.id}) but could not add it to the module: ${r.linkError} - find it in Canvas.`,
    };
  }
  return { kind: "success", text: successText(r) };
}
