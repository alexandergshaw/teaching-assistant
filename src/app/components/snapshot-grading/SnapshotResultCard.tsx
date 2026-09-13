"use client";

// Snapshot grading, WAVE 5 (docs/snapshot-grading-acceptance-criteria.md).
// Renders one completed (or in-progress) assessment: the per-shot read
// report FIRST (U8.1: the score is never rendered without it, in the same
// block, not a collapsible), the OWNER DECISION gap statement, the score and
// feedback fields (reusing AssessmentFeedbackFields verbatim rather than
// re-implementing copy/edit), and the rubric-area evidence table with each
// citation's verified/unverified state from snapshot-citations.ts's
// construction (D4) - an unverified citation renders as unverified, never as
// evidence.
//
// A7h: prefer inert output. Every field here is a TextField (via
// AssessmentFeedbackFields) or plain text - no dangerouslySetInnerHTML
// anywhere in this file, matching grading-recording/'s own record.

import { TextField } from "@mui/material";
import styles from "../../page.module.css";
import AssessmentFeedbackFields, { AssessmentScoreField } from "../assessment-shared/AssessmentFeedbackFields";
import { editAssessmentField } from "../assessment-shared/assessment-row";
import { summarizeShotReports, type SnapshotAssessmentRow, type SnapshotShotReadReport } from "./snapshot-row";
import { SNAPSHOT_ROLE_LABELS } from "./snapshot-shot";
import type { AssessmentFeedbackField } from "../assessment-shared/assessment-row";

export interface SnapshotResultCardProps {
  row: SnapshotAssessmentRow;
  onEditField: (id: string, field: AssessmentFeedbackField, value: string) => void;
  onEditStudentName: (id: string, name: string) => void;
  onCopyError: (message: string) => void;
}

function statusLabel(status: SnapshotShotReadReport["status"]): string {
  if (status === "read") return "Read";
  if (status === "partly-read") return "Partly read";
  return "Not read";
}

/** Groups shot reports by role for the "REPLIES (3, 1 not read)" heading
 *  shape (U8.1), without introducing a second grouping implementation -
 *  simple enough here that reaching for snapshot-shot.ts's groupShotsByRole
 *  (which groups full SnapshotShot objects, not reports) would cost more
 *  than it saves. */
function groupReportsByRole(reports: readonly SnapshotShotReadReport[]): Map<string, SnapshotShotReadReport[]> {
  const grouped = new Map<string, SnapshotShotReadReport[]>();
  for (const r of reports) {
    const list = grouped.get(r.role) ?? [];
    list.push(r);
    grouped.set(r.role, list);
  }
  return grouped;
}

export default function SnapshotResultCard({ row, onEditField, onEditStudentName, onCopyError }: SnapshotResultCardProps) {
  const tally = summarizeShotReports(row.shotReports);
  const grouped = groupReportsByRole(row.shotReports);
  const hasResult = row.state === "ready" || row.state === "failed";

  return (
    <div>
      <TextField
        label="Student name (typed, never inferred)"
        value={row.studentName}
        onChange={(e) => onEditStudentName(row.id, e.target.value)}
        size="small"
        fullWidth
        slotProps={{ htmlInput: { "aria-label": "Student name" } }}
      />

      {row.error && <p role="alert">{row.error}</p>}

      {hasResult && (
        <>
          {/* U8.1: the per-shot read report renders ABOVE the score, in the
              same block - a tile that was never read is named here before
              any number is shown, never after or below the fold. */}
          <div>
            <p className={styles.fieldHint}>
              Read report: {tally.read} read, {tally.partlyRead} partly read, {tally.notRead} not read.
            </p>
            {Array.from(grouped.entries()).map(([role, reports]) => (
              <p key={role} className={styles.fieldHint}>
                {(SNAPSHOT_ROLE_LABELS as Record<string, string>)[role] ?? role} (
                {reports.map((r) => `Shot ${r.shotIndex}: ${statusLabel(r.status)}${r.reason ? ` (${r.reason})` : ""}`).join(", ")}
                )
              </p>
            ))}
            {/* OWNER DECISION: a role never supplied at all is a STATED GAP,
                named above the score, not an error - this overrules the
                acceptance criteria's own X9. */}
            {row.missingRoles.length > 0 && (
              <p className={styles.fieldHint}>
                Not supplied this session: {row.missingRoles.map((r) => SNAPSHOT_ROLE_LABELS[r]).join(", ")}. Graded on general
                standards for those areas.
              </p>
            )}
            {row.imageFallbackNote && <p className={styles.fieldHint}>{row.imageFallbackNote}</p>}
            {row.instructionLikeContent && (
              <p role="alert">
                This submission contained text that attempted to instruct the grader (for example, asking for a
                specific score or citing a policy). It was graded as content, not followed.
                {row.instructionLikeContentQuote ? ` Quoted: "${row.instructionLikeContentQuote}"` : ""}
              </p>
            )}
          </div>

          <AssessmentScoreField
            rowId={row.id}
            displayName={row.studentName || "this student"}
            totalScore={row.totalScore}
            disabledPlaceholder={row.state === "pending"}
            onEditField={onEditField}
          />

          {row.rubricAreas.length > 0 && (
            <div>
              <p className={styles.fieldHint}>Rubric area evidence (D4: each citation is checked against the transcription):</p>
              {row.rubricAreas.map((area) => (
                <p key={area.area} className={styles.fieldHint}>
                  {area.area}: {area.score} -{" "}
                  {area.verified ? (
                    <>verified (Shot {area.shotIndex || "n/a"}): &quot;{area.quote}&quot;</>
                  ) : (
                    <>unverified - no matching text found in the transcription, treat as unsupported</>
                  )}
                </p>
              ))}
            </div>
          )}

          <AssessmentFeedbackFields
            rowId={row.id}
            displayName={row.studentName || "this student"}
            feedback={row}
            onEditField={onEditField}
            onCopyError={onCopyError}
          />
        </>
      )}
    </div>
  );
}

/** Pure helper the panel uses to apply a text edit to a row without
 *  reaching into assessment-row.ts directly from a component - kept here
 *  since this card is the only renderer of a SnapshotAssessmentRow's fields.
 *  Re-exported rather than duplicated so the panel's edit handler and this
 *  card's own field edits go through the exact same mutator. */
export function editSnapshotRowField(
  row: SnapshotAssessmentRow,
  field: AssessmentFeedbackField,
  value: string
): SnapshotAssessmentRow {
  return editAssessmentField(row, field, value);
}
