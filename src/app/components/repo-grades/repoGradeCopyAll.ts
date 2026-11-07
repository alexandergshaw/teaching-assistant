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
