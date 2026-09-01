// Pure helper for building the grading review-table rows from a `runs`
// array. Shared by the grade-submissions step (interactive: grades, then
// reviews, in the same run) and the review-grading-draft step (loads a
// grade-to-draft draft's runs and reviews them later, possibly in a
// different session) so their runIndex/resultIndex numbering can never
// drift apart - post-grades resolves each approved row back to
// runs[runIndex].run.results[resultIndex], and both producers of the review
// table must agree on that numbering for a posted grade to land on the
// right student.
//
// Plain module (no server actions, no DOM) so it is trivially unit-testable.

import type { GradeResult, GradingRun, GradingRunEntry } from "@/lib/grade";

export type GradingReviewRow = Record<string, string>;

// These strip helpers live here (a plain, client-safe module) rather than in
// grade.ts because grade.ts transitively imports server-only code (next/headers
// via the research db), and this module is value-imported by the client-side
// step registry. Keeping them dependency-light avoids dragging that server
// chain into the browser bundle. They reference grade.ts only for TYPES, which
// erase at build time.

/**
 * Strip a graded result's bulky, re-derivable fields before persisting it in a
 * grading draft: rawBase64 (full submitted-file bytes), previewContent, and
 * codeExecution are dropped by emptying submittedFiles. Drafts never post from
 * submittedFiles - post-grades reads only grade/comment/rubric/totalScore/
 * userId - and the review step re-fetches files from Canvas on demand. Every
 * grade-relevant field is kept. Explicit allowlist so a future GradeResult
 * field is excluded by default.
 */
export function stripGradeResultForDraft(result: GradeResult): GradeResult {
  return {
    student: result.student,
    overallComment: result.overallComment,
    // docs/grading-results-feedback-boxes-acceptance-criteria.md A5 item 16:
    // this is the exact allowlist that already dropped submissionTruncated
    // once (github-grading-run-store.ts:70-80 documents that incident) -
    // strengths/improvements/resubmitNotice are grade-relevant (they compose
    // overallComment) and small, so they are kept explicitly rather than
    // silently excluded like the comment above warns a future field would be.
    strengths: result.strengths,
    improvements: result.improvements,
    resubmitNotice: result.resubmitNotice,
    rubricAreas: result.rubricAreas,
    totalScore: result.totalScore,
    feedback: result.feedback,
    mergedFileCount: result.mergedFileCount,
    submittedFiles: [],
    userId: result.userId,
    // Kept (not bulky, and grade-relevant): which repo/ref a GitHub-URL
    // submission was actually graded against, so the draft can defend the
    // grade to a student (AC2.4) even after this run's process exits.
    gradedRepo: result.gradedRepo,
    gradedRef: result.gradedRef,
    // Kept for the same reason gradedRepo/gradedRef are: not bulky, and it
    // is exactly the fact (docs/no-submission-and-requirement-checking-
    // acceptance-criteria.md G1a) a draft/posted grade must be able to
    // defend later without parsing overallComment's prose.
    determination: result.determination,
    // Previously dropped by this allowlist (github-grading-run-store.ts had
    // to work around it by re-attaching the value by index after calling
    // this function - see that file's serializeGithubGradingRun). Kept
    // directly here now: not bulky, and every caller of this strip -
    // including grading-drafts.ts's draft persistence, which had no
    // compensating re-attachment of its own - should see the same fact a
    // restored run does.
    submissionTruncated: result.submissionTruncated,
  };
}

/** Apply stripGradeResultForDraft to every result in a run. */
export function stripGradingRunForDraft(run: GradingRun): GradingRun {
  return { ...run, results: run.results.map(stripGradeResultForDraft) };
}

/** Apply stripGradingRunForDraft to every entry's run, for a full runs array. */
export function stripGradingRunEntriesForDraft(entries: GradingRunEntry[]): GradingRunEntry[] {
  return entries.map((entry) => ({ ...entry, run: stripGradingRunForDraft(entry.run) }));
}

/**
 * Build the editable review-table rows for a runs array. runIndex/
 * resultIndex are numbered over the FULL runs array - offline entries are
 * counted in the index space (via the loop variable `i`) even though they
 * never produce a row, and non-offline results without a numeric Canvas
 * user id are skipped the same way. This exactly mirrors the numbering the
 * grade-submissions step used before this helper was extracted, and is what
 * post-grades assumes when it resolves an approved row's runIndex/
 * resultIndex.
 */
export function buildGradingReviewRows(runs: GradingRunEntry[]): GradingReviewRow[] {
  const reviewRows: GradingReviewRow[] = [];
  const fractionRegex = /(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/;

  for (let i = 0; i < runs.length; i++) {
    const entry = runs[i];
    if (entry.offline) continue;

    for (let j = 0; j < entry.run.results.length; j++) {
      const row = entry.run.results[j];
      if (typeof row.userId !== "number") continue;

      const fractionMatch = row.totalScore.match(fractionRegex);
      const earned = fractionMatch
        ? fractionMatch[1]
        : (row.totalScore.match(/-?\d+(?:\.\d+)?/) ?? [])[0] ?? "";

      reviewRows.push({
        runIndex: String(i),
        resultIndex: String(j),
        course: entry.courseName,
        assignment: entry.assignmentName,
        student: row.student,
        submission:
          entry.run.speedGraderUrl && typeof row.userId === "number"
            ? `${entry.run.speedGraderUrl}&student_id=${row.userId}`
            : "",
        grade: earned,
        outOf: entry.pointsPossible != null ? String(entry.pointsPossible) : "",
        comment: row.overallComment,
      });
    }
  }

  return reviewRows;
}

/**
 * Count of rows buildGradingReviewRows would produce for a runs array -
 * postable submissions (non-offline runs, results with a numeric Canvas user
 * id) - without building the row objects. Applies the identical offline/
 * userId predicate buildGradingReviewRows uses, kept in sync deliberately so
 * a caller's "nothing to post"/"nothing to review" gate always agrees with
 * whether the table it would guard is actually empty.
 */
export function countPostableResults(runs: GradingRunEntry[]): number {
  return runs
    .filter((r) => !r.offline)
    .reduce(
      (sum, r) => sum + r.run.results.filter((row) => typeof row.userId === "number").length,
      0
    );
}
