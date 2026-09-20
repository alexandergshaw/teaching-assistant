"use client";

// One logical row of the grading-by-recording table, rendered as TWO
// <tr>s - the same idiom recording/DiscussionReplyRow.tsx uses, whose own
// header explains why: a compact header bar (Name / Name match / State /
// Score) plus a full-width continuation row holding the submission text and
// the editable feedback fields. Read that file's header/markup before
// touching this one - the idioms below (`<th scope="row">`, per-control
// accessible names on every textarea, `aria-disabled` never `disabled`,
// a per-row error rendered as plain text rather than `role="alert"`) are
// copied from it on purpose (this implementer's brief: "reuse the shipped
// row idioms... read it first and match"). The MARKUP and STATE this file
// owns are its own - R4b is explicit that the discussion feature's actual
// row COMPONENT is not reusable here ("a second instance sharing an
// engine, not a parameterisation of the discussion surface").
//
// docs/grading-via-recording-acceptance-criteria.md section 4 (the table)
// and item 5 (a row the instructor has edited must never be silently
// overwritten by a re-grade - grading-row.ts's `userEdited`).
//
// This wave builds no move/retry actions - there is no capture loop to
// retry against and no ordering concept on GradingRow (see grading-rows.ts's
// own header on why there is no "captured" sort either).
//
// Remove ("no row can be removed" fix): a per-row Remove control, in a
// dedicated Actions column (GRADING_TABLE_COLUMN_COUNT bumped 4 -> 5),
// mirroring DiscussionReplyRow.tsx's own Remove/Confirm idiom exactly - AC19:
// arms a confirmation only when the row holds hand-written work
// (row.userEdited); a row with nothing to lose removes on the first click.
// The armed flag is invalidated the moment any of the four feedback fields
// changes under it (the "adjust state during render" idiom, same as
// DiscussionReplyRow.tsx's own `lastReplyForArm` check) - signature-based,
// never a timer.

import { memo, useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import rowStyles from "./GradingTable.module.css";
import {
  gradingRowSubmissionTimeStatus,
  joinFeedback,
  type GradingRow,
  type GradingRowNameMatch,
} from "./grading-row";
import { GRADING_TABLE_COLUMN_COUNT, type GradingFeedbackField } from "./grading-rows";
// docs/recording-controls-ux-acceptance-criteria.md CC5: the one arm/confirm
// component for every destructive or overwriting action.
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
// WAVE 3 of the assessment-grading extraction: the score field, the three
// text feedback fields, and the Copy feedback control/live region all moved
// to assessment-shared - see that file's own header for why the score
// field is a separate small export rather than folded into the default one.
import AssessmentFeedbackFields, { AssessmentScoreField } from "../assessment-shared/AssessmentFeedbackFields";
import AssessmentStateBadge from "../assessment-shared/AssessmentStateBadge";

/** R3a's four states, rendered honestly - "no-roster" gets its OWN neutral
 *  wording ("No roster to check"), never the "unmatched" copy, so it can
 *  never be misread as a finding about the student (grading-row.ts's own
 *  doc comment: "an absent roster is our gap, not the student's"). */
const NAME_MATCH_BADGE: Record<GradingRowNameMatch, { label: string; variant: "ghBadgeNeutral" | "ghBadgeWarning" | "ghBadgeSuccess" | "ghBadgeDanger" }> = {
  matched: { label: "Matched roster", variant: "ghBadgeSuccess" },
  ambiguous: { label: "Ambiguous match", variant: "ghBadgeWarning" },
  unmatched: { label: "Not on roster", variant: "ghBadgeDanger" },
  "no-roster": { label: "No roster to check", variant: "ghBadgeNeutral" },
};

export interface GradingTableRowProps {
  row: GradingRow;
  onEditField: (id: string, field: GradingFeedbackField, value: string) => void;
  onRemove: (id: string) => void;
  /**
   * Marks this row's submission as having arrived late.
   *
   * There is no timestamp involved and there must not be. The only clock this
   * surface has access to is when the INSTRUCTOR graded, and deriving lateness
   * from it would mark an entire class late for a grading session held a week
   * after the deadline. So the row records THAT it was late and stays honest
   * about not knowing when - which is why submissionTimeStatus has three
   * values rather than a boolean.
   */
  onMarkLate: (id: string) => void;
  /** CC14: a clipboard failure surfaces through the panel's existing notice
   *  path - the same channel DiscussionReplyRow.tsx's own onCopyError feeds,
   *  rather than a new row-local error affordance. */
  onCopyError: (message: string) => void;
  /** Fixer pass finding 4: registers/unregisters this row's Remove button
   *  (idle or armed - ConfirmArmButtons' `buttonRef` points at the same DOM
   *  node throughout) in GradingTable's keyed ref map, so a removal can move
   *  focus to the next row's Remove control - the same keyed-ref-map idiom
   *  DiscussionRepliesPanel.tsx:461-464 uses. */
  registerRemoveRef: (id: string, el: HTMLButtonElement | null) => void;
}

function GradingTableRowImpl({ row, onEditField, onRemove, onMarkLate, onCopyError, registerRemoveRef }: GradingTableRowProps) {
  const matchBadge = NAME_MATCH_BADGE[row.nameMatch];
  // R3b: an unmatched/ambiguous name never blocks the feedback - it only
  // changes what the row SAYS. Candidates are shown, never auto-applied
  // (grading-row.ts's own doc comment on `rosterCandidates`) - the
  // student's read name (`row.studentName`) is what renders in the Name
  // cell below, verbatim, regardless of nameMatch.
  const showCandidates = (row.nameMatch === "matched" || row.nameMatch === "ambiguous") && row.rosterCandidates.length > 0;

  // CC5 (AC19-equivalent, DiscussionReplyRow.tsx): "Remove" arms a
  // confirmation only when the row holds hand-written work (row.userEdited) -
  // re-reading a machine-graded row off a fresh capture costs nothing to
  // redo, feedback the instructor typed by hand does. Signature-based, not
  // timer-based: the armed flag is tied to the four feedback fields' CURRENT
  // values, so editing any of them after arming invalidates the confirmation
  // (the same "adjust state during render" idiom DiscussionReplyRow.tsx's
  // own `lastReplyForArm` check uses, rather than a useEffect - this repo's
  // eslint rejects a setState reached synchronously from an effect).
  const [removeArmed, setRemoveArmed] = useState(false);
  const feedbackSignature = `${row.totalScore}|${row.strengths}|${row.improvements}|${row.overallComment}`;
  const [lastFeedbackForArm, setLastFeedbackForArm] = useState(feedbackSignature);
  if (feedbackSignature !== lastFeedbackForArm) {
    setLastFeedbackForArm(feedbackSignature);
    if (removeArmed) setRemoveArmed(false);
  }
  const removeConsequenceId = `grading-remove-row-${row.id}-consequence`;

  // A row with nothing hand-typed to lose removes on the first click, same
  // as today - no arming needed at all.
  const handleRemoveOneClick = () => onRemove(row.id);

  return (
    <>
      <tr className={rowStyles.summaryRow}>
        <th scope="row">{row.studentName}</th>
        <td>
          <span className={`${styles.ghBadge} ${styles[matchBadge.variant]}`}>{matchBadge.label}</span>
          {showCandidates && (
            <p className={rowStyles.rosterCandidates}>
              {row.nameMatch === "ambiguous" ? "Could be: " : "Roster: "}
              {row.rosterCandidates.join(", ")}
            </p>
          )}
        </td>
        <td>
          <AssessmentStateBadge state={row.state} userEdited={row.userEdited} />
          {/* CC11 / AC17a-style discipline (recording/DiscussionReplyRow.tsx):
              a field-level line, never a full .notice card or role="alert" -
              several rows can fail at once and an assertive interruption per
              row is exactly the defect that convention avoids. */}
          {row.state === "failed" && row.error && <p className={rowStyles.rowErrorText}>{row.error}</p>}
        </td>
        <td>
          <AssessmentScoreField
            rowId={row.id}
            displayName={row.studentName}
            totalScore={row.totalScore}
            disabledPlaceholder={row.state === "pending"}
            onEditField={onEditField}
          />
        </td>
        <td>
          {/* CC14: right-docked action cluster, matching
              DiscussionReplyRow.tsx's own `.ghActions .rowActions` wrapper -
              layered on top of styles.ghActions rather than replacing it. */}
          <div className={`${styles.ghActions} ${rowStyles.rowActions}`}>
            {/* CC5: a row with nothing hand-typed to lose removes on the first
                click, same as today (AC19); a row the instructor has edited
                gets the shared arm/confirm component instead of a bespoke
                two-branch Button pair - one element whose label/variant/colour/
                handler swap in place on arming, so focus survives arming, and
                no onBlur disarm (a keyboard user tabbing to Cancel could never
                have confirmed under the old onBlur-on-the-confirm-button
                shape). */}
            {row.userEdited ? (
              <ConfirmArmButtons
                armed={removeArmed}
                idleLabel="Remove"
                confirmLabel="Confirm removal"
                tone="danger"
                idleVariant="text"
                idleAriaLabel={`Remove ${row.studentName}'s row`}
                confirmAriaLabel={`Confirm removal of ${row.studentName}'s row`}
                onArm={() => setRemoveArmed(true)}
                onConfirm={() => {
                  setRemoveArmed(false);
                  onRemove(row.id);
                }}
                onCancel={() => setRemoveArmed(false)}
                consequenceId={removeConsequenceId}
                buttonRef={(el) => registerRemoveRef(row.id, el)}
              />
            ) : (
              <Button
                size="small"
                variant="text"
                color="error"
                aria-label={`Remove ${row.studentName}'s row`}
                onClick={handleRemoveOneClick}
                ref={(el) => registerRemoveRef(row.id, el)}
              >
                Remove
              </Button>
            )}
            {/* D23c. Records THAT the work was late, never WHEN - the only
                clock this surface has is when the INSTRUCTOR graded, and
                deriving a submission time from it would mark a whole class
                late for a grading session held after the deadline.

                SHOWN ONLY WHEN CLICKING IT WOULD CHANGE SOMETHING, and the
                first version of this got that wrong in a way worth recording.
                It rendered a button whose label flipped to "Late" with
                aria-pressed set - so it read as a toggle - while
                markSubmissionLate only ever SETS "marked-late" and has no
                inverse. Clicking it a second time did nothing at all. A
                control that looks live and is inert is the exact defect this
                project keeps re-shipping, and dressing a one-way action as a
                toggle is how it gets in.

                So: a button only for "unknown". "marked-late" renders as
                plain text - the state is worth showing and there is nothing
                to press - and "known" hides it entirely, because a row with a
                real submission instant already answers the lateness question
                and marking it by hand could only contradict the record.

                Read through gradingRowSubmissionTimeStatus rather than off the
                field, so an older row with the property absent normalises to
                "unknown" instead of falling through every comparison. */}
            {gradingRowSubmissionTimeStatus(row) === "unknown" && (
              <Button
                size="small"
                variant="text"
                aria-label={`Mark ${row.studentName}'s submission as late`}
                onClick={() => onMarkLate(row.id)}
              >
                Mark late
              </Button>
            )}
            {gradingRowSubmissionTimeStatus(row) === "marked-late" && (
              <span className={styles.fieldHint}>Marked late</span>
            )}
          </div>
          {row.userEdited && removeArmed && (
            <p id={removeConsequenceId} role="status" aria-live="polite" className={controls.consequence}>
              {`This removes ${row.studentName}'s row and the feedback you edited.`}
            </p>
          )}
        </td>
      </tr>

      <tr className={rowStyles.bodyRow}>
        <td colSpan={GRADING_TABLE_COLUMN_COUNT}>
          <div className={rowStyles.rowBody}>
            <div className={rowStyles.submissionBlock}>
              <div className={rowStyles.blockHead}>
                <span className={styles.ghMeta}>Submission</span>
              </div>
              {/* WCAG 2.1.1: a scrollable region must itself be a keyboard
                  stop, and role="group" gives a bare scroller a role that
                  actually takes an accessible name - same fix
                  recording/DiscussionReplyRow.tsx applies to its own post
                  scroller (that file's own comment has the full account of
                  why a plain <div> cannot be named). */}
              <div className={rowStyles.submissionCell} tabIndex={0} role="group" aria-label={`Submission from ${row.studentName}`}>
                {row.submissionText}
              </div>
            </div>

            <div className={rowStyles.feedbackBlock}>
              <AssessmentFeedbackFields
                rowId={row.id}
                displayName={row.studentName}
                feedback={row}
                onEditField={onEditField}
                onCopyError={onCopyError}
                joinCopyText={joinFeedback}
              />
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

export default memo(GradingTableRowImpl);
