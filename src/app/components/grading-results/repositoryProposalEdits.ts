import type { GradeResult } from "@/lib/grade/types";
import { formatFeedback } from "@/lib/grade/parsing";
import { composeOverallCommentLocal, type FeedbackField, type RowEdit } from "./gradingResultsHelpers";

export type RepositoryFieldSelection = { total?: boolean; criteria?: readonly string[]; feedback?: readonly FeedbackField[] };
export function repositoryEditSignature(edit: RowEdit): string {
  return JSON.stringify([edit.total, edit.overall, edit.strengths, edit.improvements, edit.resubmitNotice,
    Object.keys(edit.areas).sort().map((name) => [name, edit.areas[name].score])]);
}
export function resultWithRepositoryEdits(result: GradeResult, edit: RowEdit): GradeResult {
  const overallComment = composeOverallCommentLocal(edit.strengths, edit.improvements, edit.resubmitNotice);
  const rubricAreas = result.rubricAreas.map((area) => ({ ...area, score: edit.areas[area.area]?.score ?? area.score }));
  return { ...result, totalScore: edit.total, rubricAreas, strengths: edit.strengths, improvements: edit.improvements,
    resubmitNotice: edit.resubmitNotice, overallComment, feedback: formatFeedback(overallComment, rubricAreas, edit.total) };
}
export function applyRepositoryProposalFields(current: RowEdit, prior: GradeResult, proposed: GradeResult, selection: RepositoryFieldSelection): { edit: RowEdit; result: GradeResult; scoreChanged: boolean } {
  const edit = structuredClone(current);
  if (selection.total) edit.total = proposed.totalScore;
  for (const name of selection.criteria ?? []) {
    const area = proposed.rubricAreas.find((item) => item.area === name);
    if (area) edit.areas[name] = { score: area.score };
  }
  for (const field of selection.feedback ?? []) edit[field] = proposed[field];
  edit.overall = composeOverallCommentLocal(edit.strengths, edit.improvements, edit.resubmitNotice);
  const result = resultWithRepositoryEdits(prior, edit);
  result.rubricAreas = result.rubricAreas.map((area) => selection.criteria?.includes(area.area)
    ? { ...area, comment: proposed.rubricAreas.find((item) => item.area === area.area)?.comment ?? area.comment } : area);
  result.feedback = formatFeedback(result.overallComment, result.rubricAreas, result.totalScore);
  const scoreChanged = edit.total !== current.total || prior.rubricAreas.some((area) => (edit.areas[area.area]?.score ?? area.score) !== (current.areas[area.area]?.score ?? area.score));
  return { edit, result, scoreChanged };
}
