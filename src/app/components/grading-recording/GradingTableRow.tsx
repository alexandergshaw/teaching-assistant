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

import { memo, useEffect, useRef, useState } from "react";
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import rowStyles from "./GradingTable.module.css";
import { joinFeedback, type GradingRow, type GradingRowNameMatch, type GradingRowState } from "./grading-row";
import { GRADING_TABLE_COLUMN_COUNT, type GradingFeedbackField } from "./grading-rows";
// docs/recording-controls-ux-acceptance-criteria.md CC5: the one arm/confirm
// component for every destructive or overwriting action.
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
// CC14: the shared clipboard helper - no site inlines its own guard anymore.
import { writeClipboardText } from "../ui/clipboard";
// CC14: "its icon swaps to the check for two seconds after a copy exactly as
// Copy reply does" - reused, not redrawn, from the file that idiom shipped
// in first.
import { CopyIcon, CheckIcon } from "../recording/discussion-icons";
// CC12: the shared clip-rect idiom, for the transient "Copied feedback for
// {name}" confirmation - visible confirmation is the icon swap alone (WCAG
// 2.5.3 Label in Name keeps the button's own label stable), so the fact of
// the copy reaches assistive tech through this hidden live region instead.
import { visuallyHidden } from "../ui/visuallyHidden";

// Mirrors recording/DiscussionReplyRow.tsx's own COPY_RESET_MS exactly -
// "exactly as Copy reply does" (CC14) means the same 1.5s window.
const COPY_RESET_MS = 1500;

// Fixer pass finding 3: the failure message now names the student, the same
// way every other per-row failure on this table does (Remove's consequence
// line, the failed-grade error text) - a generic "could not copy" gives an
// instructor grading several submissions no way to tell which row it was
// about once it has scrolled past.
function clipboardFailureMessage(studentName: string): string {
  return `Could not copy feedback for ${studentName} automatically. Select the text in the feedback fields and copy it.`;
}

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

function GradingTableRowImpl({ row, onEditField, onRemove, onCopyError, registerRemoveRef }: GradingTableRowProps) {
  const stateBadge = STATE_BADGE[row.state];
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

  // CC14: "Copy feedback" - joins the three feedback fields via
  // joinFeedback (grading-row.ts) and copies through the shared clipboard
  // helper (ui/clipboard.ts), the same guard every other copy site in this
  // app now shares rather than inlining its own. Icon-only confirmation
  // (CopyIcon -> CheckIcon for COPY_RESET_MS), exactly as Copy reply does -
  // the visible "Copy feedback" label never swaps, only the icon and title.
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopyFeedback = async () => {
    // Fixer pass finding 3a: an all-empty row's joinFeedback is "" (its own
    // documented empty guard, pinned in grading-row.test.ts) - copying that
    // silently would leave the instructor's clipboard empty with no sign
    // anything went wrong, and the check/CheckIcon swap would falsely claim
    // a successful copy. Refused before it ever reaches the clipboard, and
    // the icon never swaps.
    const text = joinFeedback(row);
    if (text === "") {
      onCopyError(`There is no feedback to copy for ${row.studentName} yet.`);
      return;
    }
    try {
      await writeClipboardText(text);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      onCopyError(clipboardFailureMessage(row.studentName));
    }
  };

  // Fixer pass finding 3d: a copy click just before the row unmounts (Remove
  // clicked, or the whole table cleared) must not leave a stale timer firing
  // setCopied on an unmounted component.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

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
          <span className={`${styles.ghBadge} ${styles[stateBadge.variant]}`}>{stateBadge.label}</span>
          {row.userEdited && (
            <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral} ${rowStyles.badgeGap}`}>Yours</span>
          )}
          {/* CC11 / AC17a-style discipline (recording/DiscussionReplyRow.tsx):
              a field-level line, never a full .notice card or role="alert" -
              several rows can fail at once and an assertive interruption per
              row is exactly the defect that convention avoids. */}
          {row.state === "failed" && row.error && <p className={rowStyles.rowErrorText}>{row.error}</p>}
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
              {/* CC14: "Copy feedback" - the one control the sibling
                  (DiscussionReplyRow's Copy reply) has and this row lacked.
                  The visible label is stable (WCAG 2.5.3 Label in Name, the
                  same rule Copy reply follows) - only the icon and title
                  swap on copy. */}
              <div className={styles.ghActions}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={copied ? <CheckIcon /> : <CopyIcon />}
                  onClick={() => void handleCopyFeedback()}
                  title={copied ? "Copied" : `Copy feedback for ${row.studentName}`}
                  aria-label={`Copy feedback for ${row.studentName}`}
                >
                  Copy feedback
                </Button>
              </div>
              {/* Fixer pass finding 3b: the visible label never swaps (WCAG
                  2.5.3), and the icon-only swap it does get is invisible to
                  assistive tech - this throttle-free, one-shot live region
                  announces the same confirmation for the same COPY_RESET_MS
                  window the icon shows it. */}
              {copied && (
                <span role="status" aria-live="polite" style={visuallyHidden}>
                  {`Copied feedback for ${row.studentName}`}
                </span>
              )}
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

export default memo(GradingTableRowImpl);
