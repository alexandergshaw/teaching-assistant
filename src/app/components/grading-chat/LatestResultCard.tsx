import Button from "@mui/material/Button";
import type { GradeResult } from "../../../lib/grade/types";
import { copyAllFeedbackText, FEEDBACK_FIELDS, type FeedbackField } from "../grading-results/gradingResultsHelpers";
import { describeUnresolvedNameLabel } from "../grading-results/unresolvedNameLabel";
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
  readonly copiedKey: string | null;
  readonly onCopy: (key: string, value: string) => Promise<void>;
  /** Students whose name was not found and who carry no label (chat mount only). */
  readonly unresolvedStudents?: ReadonlySet<string>;
}

export function LatestResultCard({ result, copiedKey, onCopy, unresolvedStudents }: LatestResultCardProps) {
  if (!result) return null;
  // Distinct from the matrix row's own all-feedback key so the two "Copied"
  // states never light up together.
  const copyKey = `latest-${result.student}-all-feedback`;
  const copyText = () =>
    copyAllFeedbackText({
      overall: result.overallComment,
      strengths: result.strengths,
      improvements: result.improvements,
      resubmitNotice: result.resubmitNotice,
    });
  return (
    <section className={chatStyles.latestCard} aria-label={`Latest result for ${result.student}`}>
      <div className={chatStyles.latestCardHeader}>
        <span className={chatStyles.latestCardStudent}>{result.student}</span>
        {unresolvedStudents?.has(result.student) && (
          <span className={chatStyles.latestCardLabel}>{describeUnresolvedNameLabel()}</span>
        )}
        <span className={chatStyles.latestCardScore}>{result.totalScore}</span>
        <Button
          variant="text"
          size="small"
          aria-label={`Copy feedback for ${result.student}`}
          onClick={() => void onCopy(copyKey, copyText())}
        >
          {copiedKey === copyKey ? "Copied" : "Copy feedback"}
        </Button>
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
