import { FEEDBACK_FIELDS, formatFeedback, type FeedbackBoxesEdit } from "../grading-results/gradingResultsHelpers";
import type { RubricScore } from "./rubricAlignment";

/** Include rubric comments even when there is no overall feedback. */
export function repoGradeCopyAllText(feedback: FeedbackBoxesEdit, rubric: readonly RubricScore[]): string {
  const sections = rubric.map(({ area, comment }) => ({ area, comment: studentCopyText(comment ?? "") })).filter(({ comment }) => comment).map(({ area, comment }) => `${area}:\n${comment}`);
  const details = FEEDBACK_FIELDS.map((field) => studentCopyText(feedback[field])).filter(Boolean);
  const overall = studentCopyText(feedback.overall);
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const duplicate = details.length > 0 && normalize(overall) === normalize(details.join(" "));
  const summary = [...(overall && !duplicate ? [overall] : []), ...details].map(formatFeedback);
  return [...summary, ...sections].join("\n\n");
}

/** Remove exact notices inserted by earlier application versions, preserving student feedback. */
export function studentCopyText(text: string): string {
  return text
    .replace(/^(?:Provisional model assessment\. Entry points were selected heuristically; test coverage, correctness, and artifact equivalence have not been independently verified\. Review the pinned source and execution observations\.|Provisional model feedback; execution, test coverage, correctness, and artifact equivalence have not been independently verified\. Review against the pinned source and observations\.|Provisional model feedback; the returned scores could not be reconciled with the saved rubric\. Review the pinned source and observations\.)\s*\n\s*\n/, "")
    .replace(/\n\s*\nUnassessed optional binary files: [^\n]*\. These files have not been assessed for correctness or source equivalence\. Test coverage was not independently verified\.\s*$/, "")
    .replace(/^Review-only draft\. Test coverage was not verified\.(?: Unexamined binary files: [^\n]*\.| No optional files were excluded\.)?$/, "")
    .replace(/^Review the pinned source and rubric alongside the execution observations\. Test coverage, correctness, and artifact equivalence have not been independently verified\.$/, "")
    .replace(/^These are literal source matches to rubric wording, not findings that criteria were met\. Check the pinned source and execution observations; test coverage, correctness, and artifact equivalence have not been independently verified\.$/, "")
    .replace(/^Literal keyword matches, for inspection only:\n[\s\S]*$/, "")
    .replace(/^Instructor review is required(?:; test execution was not verified)?\.$/, "")
    .trim();
}
