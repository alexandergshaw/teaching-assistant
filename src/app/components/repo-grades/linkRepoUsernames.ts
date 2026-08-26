// Repo Grades view - bringing "Link GitHub usernames to roster" into the view
// itself, instead of sending the instructor off to run the standalone
// workflow step (steps.course-setup.rosters.ts, "link-github-usernames").
// Pure, no I/O, no React, no clock: vitest here is node-env and collects only
// src/**/*.test.ts, so no component in this folder is ever rendered by a
// test - every parsing/partitioning/wording decision has to live in a module
// like this one, with the .tsx only calling it, or it is untestable.
//
// The single most misreadable fact about this feature: linking a username
// does NOT confirm a repo binding. buildRosterUpdate (roster-merge.ts) writes
// the new studentRepos row with `repo: ""`, so the full-repo-name match in
// repo-student-bindings.ts (rule a) never fires for it. What DOES fire is
// tier 1, tierStoredUsername, which classifies the row as `state: "suggested"`
// - a candidate the instructor still has to confirm per row. So every string
// this module produces about a successful link says "suggested", never
// "linked" or "confirmed" on its own, so the instructor cannot read a
// finished action into a step that only proposed one.

import { extractGithubHandle } from "@/lib/github-usernames";

/**
 * One Canvas text submission, narrowed to what this module needs.
 * Structurally satisfied by CanvasTextSubmission (src/lib/canvas/listings.ts:306).
 */
export interface GithubUsernameSubmission {
  userId: number;
  name: string;
  submittedText: string;
}

export interface LinkUsernamesPartition {
  /** Submissions that yielded a valid GitHub handle, in RosterSubmission shape
   * (src/lib/workflows/roster-merge.ts:15) so the caller can hand them straight
   * to buildRosterUpdate. */
  ok: Array<{ student: string; canvasUserId: string; username: string }>;
  /** One "Name: \"raw text\"" line per submission that had text but no clean
   * handle - the instructor has to look at these by hand. */
  ambiguous: string[];
}

/**
 * Mirrors steps.course-setup.rosters.ts:122-133 exactly: a submission is `ok`
 * only when extractGithubHandle says so; it is `ambiguous` only when it is
 * not ok AND extractGithubHandle still returned a non-empty handle (it tried
 * to parse something and failed to validate it); a submission whose handle
 * comes back empty - nothing there to parse - is silently ignored, because a
 * student who submitted nothing is not a parsing problem for the instructor
 * to review. Never mutates `submissions`.
 */
export function partitionGithubUsernameSubmissions(
  submissions: readonly GithubUsernameSubmission[]
): LinkUsernamesPartition {
  const ok: LinkUsernamesPartition["ok"] = [];
  const ambiguous: string[] = [];

  for (const submission of submissions) {
    const { handle, ok: isOk } = extractGithubHandle(submission.submittedText);
    if (isOk) {
      ok.push({
        student: submission.name,
        canvasUserId: String(submission.userId),
        username: handle,
      });
    } else if (handle) {
      ambiguous.push(`${submission.name}: "${submission.submittedText}"`);
    }
  }

  return { ok, ambiguous };
}

export interface LinkUsernamesOutcome {
  assignmentId: string;
  assignmentName: string;
  /** buildRosterUpdate's `linked` - usernames written onto the tile. */
  linked: number;
  ambiguous: string[];
  /** buildRosterUpdate's `conflicts` - duplicate username / duplicate name notes. */
  conflicts: string[];
  /** false when nothing was written (no clean handle found), so the caller can
   * say "the tile was not changed" honestly. */
  changed: boolean;
}

/**
 * One line for the view's aria-live region and the panel's result text.
 * Honest about the two-step nature of this feature (see this file's header):
 * a successful link only makes bindings SUGGESTED, never confirmed. Appends
 * the ambiguous and conflict counts only when non-zero, each pointing at the
 * activity log rather than dumping the raw lines into a one-liner.
 */
export function linkUsernamesSummaryLine(outcome: LinkUsernamesOutcome): string {
  const parts: string[] = [];

  if (!outcome.changed || outcome.linked === 0) {
    parts.push(
      `Found no clean GitHub usernames in "${outcome.assignmentName}" - the tile was not changed.`
    );
  } else {
    parts.push(
      `Linked ${outcome.linked} GitHub username(s) from "${outcome.assignmentName}" - repos matching them now show as suggested bindings to confirm.`
    );
  }

  if (outcome.ambiguous.length > 0) {
    parts.push(`${outcome.ambiguous.length} ambiguous submission(s) need manual review - see the activity log.`);
  }

  if (outcome.conflicts.length > 0) {
    parts.push(`${outcome.conflicts.length} conflict(s) need review - see the activity log.`);
  }

  return parts.join(" ");
}

/**
 * Detail text for the activity log entry - denser than the summary line, and
 * it must name the assignment, since a log read months later has no other way
 * to know which assignment was read.
 */
export function linkUsernamesLogDetail(outcome: LinkUsernamesOutcome): string {
  const parts: string[] = [
    `Linked ${outcome.linked} GitHub username(s) from assignment "${outcome.assignmentName}" (id ${outcome.assignmentId}) as suggested bindings.`,
  ];

  if (outcome.ambiguous.length > 0) {
    parts.push(`Ambiguous (${outcome.ambiguous.length}): ${outcome.ambiguous.join("; ")}`);
  }

  if (outcome.conflicts.length > 0) {
    parts.push(`Conflicts (${outcome.conflicts.length}): ${outcome.conflicts.join("; ")}`);
  }

  return parts.join(" ");
}
