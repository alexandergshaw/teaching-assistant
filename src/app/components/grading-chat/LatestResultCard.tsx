import type { GradeResult } from "../../../lib/grade/types";
import { FEEDBACK_FIELDS, type FeedbackField } from "../grading-results/gradingResultsHelpers";
import chatStyles from "./grading-chat.module.css";

// GRADER-WORKFLOW-OVERHAUL M1: a READ-ONLY view of the newest arrived result,
// shown with the sticky composer so it can be read without scrolling the matrix.
const FIELD_LABELS: Record<FeedbackField, string> = {
  strengths: "Strengths",
  improvements: "Improvements",
  resubmitNotice: "Resubmit notice",
};

export interface LatestResultCardProps {
  readonly result: GradeResult | null;
}

export function LatestResultCard({ result }: LatestResultCardProps) {
  if (!result) return null;
  return (
    <section className={chatStyles.latestCard} aria-label={`Latest result for ${result.student}`}>
      <div className={chatStyles.latestCardHeader}>
        <span className={chatStyles.latestCardStudent}>{result.student}</span>
        <span className={chatStyles.latestCardScore}>{result.totalScore}</span>
      </div>
      {FEEDBACK_FIELDS.map((field) => (
        <div key={field} className={chatStyles.latestCardField}>
          <span className={chatStyles.latestCardLabel}>{FIELD_LABELS[field]}</span>
          <p className={chatStyles.latestCardText}>{result[field]}</p>
        </div>
      ))}
    </section>
  );
}

export default LatestResultCard;
