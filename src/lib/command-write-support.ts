// The one answer to "does the command interface have a write path for this
// module item?" - shared by the CLASSIFIER (command-proposal.ts, which decides
// what the proposal may even offer) and the APPLY path
// (command-apply-outcome.ts / the action, which decides what may be written).
//
// It exists because those two disagreed, and the disagreement was visible to
// the instructor. The classifier reused `isCarryWriteSupportedKind`
// (module-pattern-plan.ts), which answers a DIFFERENT question - "can the
// carry-forward feature CREATE this kind at all" - and therefore returns true
// for a SubHeader and for a File that has a contentId. The apply path used its
// own `routeItemKind`, which correctly calls both unsupported. So a SubHeader
// was proposed as a writable "modify" row: it rendered with a ticked opt-in
// box, a "will be written to Canvas as" byte preview and a "no reachable undo"
// warning, it was counted in the modal's "N changes ready to apply", and only
// at write time did it come back refused. AC3b and G11 both require an
// unsupported kind to be surfaced as UNSUPPORTED IN THE PROPOSAL, not promoted
// and then refused.
//
// Pure: no I/O, no React, no clock. Deliberately a separate module from both
// callers so neither owns it and neither can quietly re-spell it - the way the
// two spellings above drifted in the first place.

export type CommandWriteRoute = "gradable" | "page" | "unsupported";

/**
 * Which Canvas write path an item kind takes, or "unsupported".
 *
 * `isNewQuiz` resolves G11's New Quizzes hazard, and the null case is the
 * interesting one. A New Quiz appears in a module as an `Assignment` (a
 * quiz_lti assignment), not as a `Quiz` - so without this flag it routes down
 * the gradable path, `updateGradable` writes `assignment[description]`,
 * **Canvas returns 200**, and the text lands on a field the New Quizzes UI
 * never displays. That is the worst shape a failure can take here: a silent
 * no-visible-effect write reported to the instructor as success.
 *
 *   - `true`  -> "unsupported". Refused with a named reason, the same posture
 *                rubric-bulk.ts takes for a flagged New Quiz.
 *   - `false` -> route normally; the caller resolved the flag and it is not one.
 *   - `null`  -> UNKNOWN, and treated as ordinary. Stated plainly rather than
 *                hidden: `CanvasModuleItem` carries no `isNewQuiz` field (it
 *                lives on `BulkItem`, from the course-level reader), so a
 *                caller that has not resolved the flag cannot tell. Refusing
 *                every unresolved Assignment would disable the feature's most
 *                common target to guard a rarer one, so the caller is expected
 *                to resolve the flag once per proposal (one course-level
 *                fetch, as `resolveNewQuizFlags` does) rather than per row.
 */
export function commandWriteRouteForItem(
  itemType: string,
  isNewQuiz: boolean | null = null
): CommandWriteRoute {
  if (isNewQuiz === true) return "unsupported";
  if (itemType === "Assignment" || itemType === "Quiz" || itemType === "Discussion") return "gradable";
  if (itemType === "Page") return "page";
  return "unsupported";
}

/** The boolean form, for the classifier's kind guard. Never re-derive this
 * from a list of kinds - call it, so the classifier and the write path cannot
 * drift apart again. */
export function commandCanWriteItemKind(itemType: string, isNewQuiz: boolean | null = null): boolean {
  return commandWriteRouteForItem(itemType, isNewQuiz) !== "unsupported";
}

/** The reason text for a kind this app cannot write, named per kind so the
 * proposal says WHY rather than "unsupported". Kept beside the predicate so a
 * new unsupported kind cannot be added without a reason for it. */
export function commandWriteUnsupportedReason(itemType: string, isNewQuiz: boolean | null = null): string {
  if (isNewQuiz === true) {
    return "This is a New Quiz. Its content lives in the New Quizzes service, not on the Canvas assignment this app can write, so a rewrite here would report success and change nothing a student sees.";
  }
  if (itemType === "SubHeader") return "A module text header has no title or description this app can write.";
  if (itemType === "File") return "A file's contents cannot be rewritten from a command.";
  if (itemType === "ExternalUrl" || itemType === "ExternalTool") {
    return "An external link or tool has no course content in Canvas to rewrite.";
  }
  return `This app has no write path for a ${itemType || "module"} item.`;
}
