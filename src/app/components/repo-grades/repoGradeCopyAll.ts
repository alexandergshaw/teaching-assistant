import type { RepoGradeSavedAttempt } from "./repoGradesDashboardModel";
import { FEEDBACK_FIELDS, formatFeedback, type FeedbackBoxesEdit } from "../grading-results/gradingResultsHelpers";
import type { RubricScore } from "./rubricAlignment";

/** Include rubric comments even when there is no overall feedback. */
export function repoGradeCopyAllText(feedback: FeedbackBoxesEdit, rubric: readonly RubricScore[]): string {
  const sections = rubric.filter(({ comment }) => comment?.trim()).map(({ area, comment }) => `${area}:\n${comment!.trim()}`);
  const details = FEEDBACK_FIELDS.map((field) => feedback[field].trim()).filter(Boolean);
  const overall = feedback.overall.trim();
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const duplicate = details.length > 0 && normalize(overall) === normalize(details.join(" "));
  const summary = [...(overall && !duplicate ? [overall] : []), ...details].map(formatFeedback);
  return [...summary, ...sections].join("\n\n");
}

export function resultCopyNotice(attempt: RepoGradeSavedAttempt): string | undefined {
  const notices: string[] = [];
  if (attempt.unexamined_artifacts?.length) notices.push("Some optional binary files were not examined; their correctness and equivalence to source were not established.");
  if (attempt.module12_evidence) notices.push(`${attempt.status === "partial" ? "This review is unscored." : "This score is provisional."} Test counts, coverage and binary-to-source equivalence were not independently verified; runtime failures may reflect unavailable dependencies.`);
  if (attempt.general_execution_evidence) notices.push(attempt.general_execution_evidence.policy === "source-only"
    ? "No execution was attempted for this written-work assessment."
    : "Execution entry points were selected heuristically. Test counts, coverage and source equivalence were not independently verified; unsupported files were not assessed. Wine observations do not establish native Windows compatibility.");
  if (attempt.general_execution_evidence && attempt.status !== "partial") notices.push("This is a provisional model assessment of the pinned submission.");
  return notices.join(" ") || undefined;
}

export function withCopyNotice(text: string, notice?: string): string {
  return text && notice ? `${text}\n\n${notice}` : text;
}


export function scoredCopyNotice(attempt: RepoGradeSavedAttempt, earlier: boolean): string {
  return [earlier ? "This feedback belongs to an earlier or unconfirmed grading attempt." : "", resultCopyNotice(attempt)].filter(Boolean).join(" ");
}
