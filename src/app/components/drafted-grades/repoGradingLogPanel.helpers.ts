// Drafted Grades tab - the repo-grading run log panel's pure decisions
// (docs/repo-grading-records-acceptance-criteria.md, R1.6). Entry 342 built
// the per-repo run record and attached it to the draft
// (`payload.repoGradingLog`, src/lib/repo-grading-log.ts,
// GradingDraftPayload in src/lib/grading-drafts.ts) but nothing rendered it -
// a grep for `repoGradingLog` across src/app/components returned nothing.
// This module is the small set of UI-facing decisions the panel needs on top
// of the already-pure repo-grading-log.ts formatters (formatRepoGradingLogCsv,
// formatRepoGradingLogJson, repoGradingLogFileName - reused as-is, never
// reimplemented here per REGRESSION entry 267 check 4 / entry 333's own
// reuse). Pure, no React, no clock - vitest here is node-env and collects
// only src/**/*.test.ts, so nothing rendered is ever exercised by a test,
// which is exactly why "does this draft get a panel at all" and "what does
// the summary line say" live here instead of inline in the .tsx.

import type { GradingDraftPayload } from "@/lib/grading-drafts";
import { summarizeRepoGradingRunLog, type RepoGradingRunLog } from "@/lib/repo-grading-log";

/** A type guard, not just a boolean check, so a caller that narrows on this
 * gets `payload.repoGradingLog` back as definitely-present rather than having
 * to re-assert it. A draft with no log (an older draft, or a non-`"repos"`
 * source - `lms`/`cartridge` never write this field, and neither does a
 * draft saved before entry 342) must render nothing rather than an empty
 * panel, so this is the single gate the panel checks before rendering
 * anything at all. */
export function hasRepoGradingLog(
  payload: GradingDraftPayload
): payload is GradingDraftPayload & { repoGradingLog: RepoGradingRunLog } {
  return payload.repoGradingLog != null;
}

/** The one-line summary shown above the download buttons: how many repos
 * were attempted and their outcome split (R1.2), matching the phrasing
 * buildRepoGradingReportMarkdown already uses for the unattended report so
 * the two surfaces describe the same run the same way. A run of 22 grades
 * that silently skipped 8 repos is exactly the situation this line exists to
 * surface, so it always states the full outcome split rather than only the
 * graded count. */
export function repoGradingLogSummaryLine(log: RepoGradingRunLog): string {
  const summary = summarizeRepoGradingRunLog(log);
  return `${summary.attempted} repo${summary.attempted === 1 ? "" : "s"} attempted - ${summary.graded} graded, ${summary.skipped} skipped, ${summary.failed} failed.`;
}

/** R1.5: a run cut short before reaching every repo it intended to must say
 * so, distinct from "there were none" - `null` when the run was not
 * truncated, so the panel renders nothing extra for the common (complete)
 * case rather than an empty/zero note. */
export function repoGradingLogTruncationNote(log: RepoGradingRunLog): string | null {
  if (!log.truncated) return null;
  const count = log.notReached.length;
  return count > 0
    ? `The run ended before reaching ${count} more repo${count === 1 ? "" : "s"}.`
    : "The run ended before reaching the rest of the repos.";
}
