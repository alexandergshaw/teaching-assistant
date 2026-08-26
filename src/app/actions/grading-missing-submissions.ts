// Extracted from src/app/actions/grading.ts (originally lines 172-210 and
// 295-333 - listMissingSubmissionsAction and draftZerosForMissingAction each
// carried an IDENTICAL block resolving which Canvas assignment ids to
// examine) as part of splitting that file back under the project's
// 1000-line-per-file cap (AGENTS.md). grading.ts is a "use server" file,
// which may only export async functions - these are plain sync/pure
// functions, so they must live in a non-"use server" module the action file
// imports rather than export them directly.
//
// Owns the pure "decide which assignment ids are in scope" logic shared by
// both actions: parsing a Canvas course id out of a course URL, parsing a
// single assignment id out of either a URL or a bare numeric string, and
// filtering a course's assignment briefs down to the past-due, zeroable ones
// when no single assignment was named. No I/O, no clock read beyond the
// caller-supplied `nowIso`, no randomness - every export below is a pure
// function of its arguments.

import { isZeroableAssignment } from "@/lib/grade-zeros";
import type { CanvasAssignmentWithDue } from "@/lib/canvas";

/** Parse the numeric Canvas course id out of a course URL
 * (".../courses/4821/..."), or null when the URL has no such segment. */
export function parseCourseIdFromCanvasUrl(courseUrl: string): string | null {
  const courseMatch = courseUrl.match(/courses\/(\d+)/);
  return courseMatch && courseMatch[1] ? courseMatch[1] : null;
}

/** Parse a single target assignment id from either a Canvas URL
 * (".../assignments/99") or a bare numeric id ("99"), trimming surrounding
 * whitespace first. Returns null when neither form matches. */
export function parseSingleAssignmentId(rawAssignmentId: string): string | null {
  const assignId = rawAssignmentId.trim();
  const match = assignId.match(/assignments\/(\d+)/);
  return match ? match[1] : /^\d+$/.test(assignId) ? assignId : null;
}

/** Filter a course's assignment briefs down to the ones past due (relative to
 * `nowIso`) and eligible for auto-zeroing (isZeroableAssignment), for the
 * "sweep every past-due assignment" path taken when no single assignment id
 * was given. Returns the matching assignment ids, in the briefs' own order. */
export function selectPastDueZeroableAssignmentIds(
  briefs: readonly CanvasAssignmentWithDue[],
  nowIso: string
): string[] {
  const now = new Date(nowIso).getTime();
  return briefs
    .filter(
      (b) =>
        b.dueAt &&
        new Date(b.dueAt).getTime() < now &&
        isZeroableAssignment({
          submissionTypes: b.submissionTypes,
          gradingType: b.gradingType,
          published: b.published,
          omitFromFinalGrade: b.omitFromFinalGrade,
        })
    )
    .map((b) => b.assignmentId);
}
