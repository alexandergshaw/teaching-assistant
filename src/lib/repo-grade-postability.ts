// Repo Grades view - AC5 item 28: ONE pure predicate deciding whether a
// grid cell is postable to Canvas, so the button's enabled state and the
// post payload built from it can never disagree - the failure mode this
// guards against is a UI that shows a row as postable (button enabled) while
// the actual post payload silently drops or miscomputes it, or vice versa.
// Pure, no I/O.

import type { RepoBindingState } from "@/lib/repo-student-bindings";

export interface PostabilityInput {
  bindingState: RepoBindingState;
  /** The row's bound Canvas user id, or null when unbound. May be present
   * but non-numeric for an "unbound" row from a stored bad id - see
   * repo-student-bindings.ts rule a. */
  canvasUserId: string | null;
  /** The column's mapped Canvas assignment id, or null when the column has
   * no mapping yet (AC5 item 25). */
  assignmentId: string | null;
  /** Whether this repo has the column's assignment folder at all (AC3 item
   * 15 - "no folder" is a distinct state from "folder present, ungraded"). */
  folderPresent: boolean;
  /** The raw, editable-cell score text, exactly as typed - not yet parsed. */
  score: string;
}

export type PostabilityResult =
  | { postable: true; userId: number; score: number }
  | { postable: false; reason: string };

/**
 * Whether one grid cell is postable to Canvas, and - when it is - the exact
 * numeric userId/score to send. Requires ALL of: binding state "confirmed";
 * canvasUserId all-digits; a non-blank assignmentId; folderPresent; and score
 * parsing to a finite number. Each failure names specifically what is
 * missing (AC5 item 28) so the UI can show a real per-row explanation
 * instead of a bare "not postable".
 */
export function repoGradePostability(input: PostabilityInput): PostabilityResult {
  const { bindingState, canvasUserId, assignmentId, folderPresent, score } = input;

  if (bindingState !== "confirmed") {
    return {
      postable: false,
      reason: `The student binding is "${bindingState}", not confirmed - accept or resolve the binding first.`,
    };
  }

  const idTrimmed = (canvasUserId ?? "").trim();
  if (!/^\d+$/.test(idTrimmed)) {
    return { postable: false, reason: "No numeric Canvas user id is bound to this row." };
  }

  const assignmentTrimmed = (assignmentId ?? "").trim();
  if (!assignmentTrimmed) {
    return { postable: false, reason: "This column has no mapped Canvas assignment." };
  }

  if (!folderPresent) {
    return { postable: false, reason: "This repo has no folder for this assignment." };
  }

  const scoreTrimmed = score.trim();
  if (!scoreTrimmed) {
    return { postable: false, reason: "Enter a score before posting." };
  }

  const parsedScore = Number(scoreTrimmed);
  if (!Number.isFinite(parsedScore)) {
    return { postable: false, reason: `"${score}" is not a valid score.` };
  }

  return { postable: true, userId: Number(idTrimmed), score: parsedScore };
}
