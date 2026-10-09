// GR-POST-ONE-CONFIRM: the per-row "Post to Canvas" button arms before it
// writes. Mirrors the Repo Grades cell idiom (RepoGradeCellControl.tsx B4):
// only the FIRST post of a row needs the arming click; a retry after an error
// or a deliberate re-post after a success stays one click. The armed state
// records WHAT IT WAS ARMED FOR (a signature of the numbers and comment that
// would post), so editing the row disarms a stale arm by construction and
// arming one row never arms another.

import { isConfirmArmed } from "../content-tab/modules/confirmArming";

export interface PostOneArm {
  student: string;
  signature: string;
}

/** What the row would post, as a value. Changing it invalidates an arm. */
export function postOneSignature(total: string, overall: string, areaScores: string[] = []): string {
  return `${total}|${overall.length}|${overall}|${areaScores.length}|${areaScores.map((s) => `${s.length}:${s}`).join(",")}`;
}

/**
 * The signature of a whole row as it would post: total, comment, and every
 * rubric area score in rubric order (the same fallback buildRowPostPayload
 * uses when an area has no edit). Both the click handler and the render call
 * THIS, so arm and render cannot diverge.
 */
export function postOneRowSignature(
  row: { rubricAreas: { area: string; score: string }[] },
  edit: { total: string; overall: string; areas: Record<string, { score: string } | undefined> },
): string {
  return postOneSignature(
    edit.total,
    edit.overall,
    row.rubricAreas.map((a) => (edit.areas[a.area] ?? { score: a.score }).score),
  );
}

/** True when the row has neither been posted nor errored in this session. */
export function isFirstPostStatus(status: string | undefined): boolean {
  return status !== "posted" && status !== "error";
}

/** Is THIS row currently armed for exactly what it would post now? */
export function isRowArmed(armed: PostOneArm | null, student: string, signature: string): boolean {
  return isConfirmArmed(armed && armed.student === student ? armed.signature : null, signature);
}

/** Render-side: is this row's button showing "Confirm post"? */
export function isPostOneArmed(
  armed: PostOneArm | null,
  student: string,
  status: string | undefined,
  signature: string,
): boolean {
  return isFirstPostStatus(status) && isRowArmed(armed, student, signature);
}

/** The single decision a click makes: arm first, or write. */
export function decidePostOneClick(args: {
  status: string | undefined;
  armed: PostOneArm | null;
  student: string;
  signature: string;
}): "arm" | "post" {
  if (!isFirstPostStatus(args.status)) return "post";
  return isRowArmed(args.armed, args.student, args.signature) ? "post" : "arm";
}
