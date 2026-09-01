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
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import rowStyles from "./GradingTable.module.css";
import type { GradingRow, GradingRowNameMatch, GradingRowState } from "./grading-row";
import { GRADING_TABLE_COLUMN_COUNT, type GradingFeedbackField } from "./grading-rows";

const STATE_BADGE: Record<GradingRowState, { label: string; variant: "ghBadgeNeutral" | "ghBadgeWarning" | "ghBadgeSuccess" | "ghBadgeDanger" }> = {
  pending: { label: "Waiting", variant: "ghBadgeNeutral" },
  grading: { label: "Grading", variant: "ghBadgeWarning" },
  ready: { label: "Ready", variant: "ghBadgeSuccess" },
  failed: { label: "Failed", variant: "ghBadgeDanger" },
};

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
}

function GradingTableRowImpl({ row, onEditField, onRemove }: GradingTableRowProps) {
  const stateBadge = STATE_BADGE[row.state];
  const matchBadge = NAME_MATCH_BADGE[row.nameMatch];
  // R3b: an unmatched/ambiguous name never blocks the feedback - it only
  // changes what the row SAYS. Candidates are shown, never auto-applied
  // (grading-row.ts's own doc comment on `rosterCandidates`) - the
  // student's read name (`row.studentName`) is what renders in the Name
  // cell below, verbatim, regardless of nameMatch.
  const showCandidates = (row.nameMatch === "matched" || row.nameMatch === "ambiguous") && row.rosterCandidates.length > 0;

  // AC19-equivalent (DiscussionReplyRow.tsx): "Remove" arms a confirmation
  // only when the row holds hand-written work (row.userEdited) - re-reading
  // a machine-graded row off a fresh capture costs nothing to redo, feedback
  // the instructor typed by hand does. Signature-based, not timer-based: the
  // armed flag is tied to the four feedback fields' CURRENT values, so
  // editing any of them after arming invalidates the confirmation (the same
  // "adjust state during render" idiom DiscussionReplyRow.tsx's own
  // `lastReplyForArm` check uses, rather than a useEffect - this repo's
  // eslint rejects a setState reached synchronously from an effect).
  const [removeArmed, setRemoveArmed] = useState(false);
  const feedbackSignature = `${row.totalScore}|${row.strengths}|${row.improvements}|${row.overallComment}`;
  const [lastFeedbackForArm, setLastFeedbackForArm] = useState(feedbackSignature);
  if (feedbackSignature !== lastFeedbackForArm) {
    setLastFeedbackForArm(feedbackSignature);
    if (removeArmed) setRemoveArmed(false);
  }

  const handleRemoveClick = () => {
    if (row.userEdited && !removeArmed) {
      setRemoveArmed(true);
      return;
    }
    setRemoveArmed(false);
    onRemove(row.id);
  };

  return (
    <>
      <tr className={rowStyles.summaryRow}>
        <th scope="row">{row.studentName}</th>
        <td>
          <span className={`${styles.ghBadge} ${styles[matchBadge.variant]}`}>{matchBadge.label}</span>
          {showCandidates && (
            <p className={rowStyles.rosterCandidates} style={{ marginTop: "var(--space-1)" }}>
              {row.nameMatch === "ambiguous" ? "Could be: " : "Roster: "}
              {row.rosterCandidates.join(", ")}
            </p>
          )}
        </td>
        <td>
          <span className={`${styles.ghBadge} ${styles[stateBadge.variant]}`}>{stateBadge.label}</span>
          {row.userEdited && (
            <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`} style={{ marginLeft: "var(--space-1)" }}>
              Yours
            </span>
          )}
          {/* AC17a-style discipline (recording/DiscussionReplyRow.tsx):
              plain text, never role="alert" - several rows can fail at once
              and an assertive interruption per row is exactly the defect
              that convention avoids. */}
          {row.state === "failed" && row.error && (
            <p className={styles.error} style={{ marginTop: "var(--space-1)" }}>
              {row.error}
            </p>
          )}
        </td>
        <td>
          <TextField
            value={row.totalScore}
            onChange={(e) => onEditField(row.id, "totalScore", e.target.value)}
            size="small"
            placeholder={row.state === "pending" ? "-" : undefined}
            className={rowStyles.scoreField}
            slotProps={{ htmlInput: { "aria-label": `Score for ${row.studentName}` } }}
          />
        </td>
        <td>
          {/* AC19: two literal branches (not one Button with a ternary
              aria-label) so React reconciles them as updates to the SAME
              underlying element - no remount, no lost focus on arming.
              DiscussionReplyRow.tsx's own Remove/Confirm pair is the exact
              precedent. */}
          {removeArmed ? (
            <Button size="small" color="error" aria-label={`Confirm removal of ${row.studentName}'s row`} onClick={handleRemoveClick} onBlur={() => setRemoveArmed(false)}>
              Confirm
            </Button>
          ) : (
            <Button size="small" color="error" aria-label={`Remove ${row.studentName}'s row`} onClick={handleRemoveClick}>
              Remove
            </Button>
          )}
          {removeArmed && (
            <p className={styles.fieldHint} role="status" aria-live="polite" style={{ margin: "var(--space-1) 0 0" }}>
              {`This will lose the feedback you typed for ${row.studentName}. Click Remove again to confirm.`}
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
              <TextField
                label="Strengths"
                value={row.strengths}
                onChange={(e) => onEditField(row.id, "strengths", e.target.value)}
                multiline
                minRows={2}
                fullWidth
                size="small"
                slotProps={{ htmlInput: { "aria-label": `Strengths for ${row.studentName}` } }}
              />
              <TextField
                label="Improvements"
                value={row.improvements}
                onChange={(e) => onEditField(row.id, "improvements", e.target.value)}
                multiline
                minRows={2}
                fullWidth
                size="small"
                slotProps={{ htmlInput: { "aria-label": `Improvements for ${row.studentName}` } }}
              />
              <TextField
                label="Overall comment"
                value={row.overallComment}
                onChange={(e) => onEditField(row.id, "overallComment", e.target.value)}
                multiline
                minRows={3}
                fullWidth
                size="small"
                slotProps={{ htmlInput: { "aria-label": `Overall comment for ${row.studentName}` } }}
              />
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

export default memo(GradingTableRowImpl);
