"use client";

// WAVE 3 of the assessment-grading extraction, following WAVE 1's
// assessment-row.ts and WAVE 2's assessment-row-store.ts /
// useAssessmentRowStore.ts.
//
// This file is a MOVE, not a redesign, of two pieces that used to live
// inline in grading-recording/GradingTableRow.tsx: the score input (a
// small named export, `AssessmentScoreField`, kept separate because it
// renders in the row's compact summary <tr> while everything else here
// renders in the row's full-width continuation <tr> - see
// docs/REGRESSION.md entry 411's "Facts about the surrounding gates" for
// why GRADING_TABLE_COLUMN_COUNT/the five-column header layout means the
// two placements cannot be collapsed into one rendered tree), and the
// default export, `AssessmentFeedbackFields`, covering the three text
// feedback fields plus the Copy control and its live region. The BEHAVIOUR
// is lifted verbatim - a behaviour change here is a silent regression across
// a shipped feature that no component-rendering test could ever catch
// (this repo's vitest is node-env; nothing here is rendered by any test).
//
// MUI TRAP, preserved on purpose: onKeyDown/onKeyUp would reach the input
// only through `slotProps.input`; ARIA attributes and onClick only through
// `slotProps.htmlInput`. Every field below only ever needed `aria-label`,
// so every one of them uses `slotProps.htmlInput` exactly as the original
// did - this comment exists so a future edit does not "tidy" them into one
// slot and silently break a handler that has not been added yet.

import { useEffect, useRef, useState } from "react";
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import rowStyles from "../grading-recording/GradingTable.module.css";
import { CopyIcon, CheckIcon } from "../recording/discussion-icons";
import { writeClipboardText } from "../ui/clipboard";
import { visuallyHidden } from "../ui/visuallyHidden";
import { joinAssessmentFeedback, type AssessmentFeedback, type AssessmentFeedbackField } from "./assessment-row";

// Mirrors recording/DiscussionReplyRow.tsx's own COPY_RESET_MS exactly -
// the same 1.5s window every other icon-swap confirmation on these
// surfaces uses.
const COPY_RESET_MS = 1500;

function clipboardFailureMessage(displayName: string): string {
  return `Could not copy feedback for ${displayName} automatically. Select the text in the feedback fields and copy it.`;
}

export interface AssessmentScoreFieldProps {
  rowId: string;
  displayName: string;
  totalScore: string;
  disabledPlaceholder: boolean;
  onEditField: (id: string, field: AssessmentFeedbackField, value: string) => void;
}

/**
 * The score input alone - rendered in the row's compact summary bar, not
 * alongside the fields below. Lifted verbatim from GradingTableRow.tsx's
 * own totalScore TextField.
 */
export function AssessmentScoreField({
  rowId,
  displayName,
  totalScore,
  disabledPlaceholder,
  onEditField,
}: AssessmentScoreFieldProps) {
  return (
    <TextField
      value={totalScore}
      onChange={(e) => onEditField(rowId, "totalScore", e.target.value)}
      size="small"
      placeholder={disabledPlaceholder ? "-" : undefined}
      className={rowStyles.scoreField}
      slotProps={{ htmlInput: { "aria-label": `Score for ${displayName}` } }}
    />
  );
}

export interface AssessmentFeedbackFieldsProps {
  rowId: string;
  displayName: string;
  feedback: AssessmentFeedback;
  onEditField: (id: string, field: AssessmentFeedbackField, value: string) => void;
  onCopyError: (message: string) => void;
}

/**
 * The three text feedback fields (strengths / improvements / overall
 * comment) plus the Copy feedback control and its hidden live region.
 * Lifted verbatim from GradingTableRow.tsx's own body-row markup and
 * handleCopyFeedback.
 */
export default function AssessmentFeedbackFields({
  rowId,
  displayName,
  feedback,
  onEditField,
  onCopyError,
}: AssessmentFeedbackFieldsProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyFeedback = async () => {
    // An all-empty row's joinAssessmentFeedback is "" - copying that
    // silently would leave the instructor's clipboard empty with no sign
    // anything went wrong, and the check/CheckIcon swap would falsely
    // claim a successful copy. Refused before it ever reaches the
    // clipboard, and the icon never swaps.
    const text = joinAssessmentFeedback(feedback);
    if (text === "") {
      onCopyError(`There is no feedback to copy for ${displayName} yet.`);
      return;
    }
    try {
      await writeClipboardText(text);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      onCopyError(clipboardFailureMessage(displayName));
    }
  };

  // A copy click just before the row unmounts (Remove clicked, or the
  // whole table cleared) must not leave a stale timer firing setCopied on
  // an unmounted component.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  return (
    <>
      <TextField
        label="Strengths"
        value={feedback.strengths}
        onChange={(e) => onEditField(rowId, "strengths", e.target.value)}
        multiline
        minRows={2}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { "aria-label": `Strengths for ${displayName}` } }}
      />
      <TextField
        label="Improvements"
        value={feedback.improvements}
        onChange={(e) => onEditField(rowId, "improvements", e.target.value)}
        multiline
        minRows={2}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { "aria-label": `Improvements for ${displayName}` } }}
      />
      <TextField
        label="Overall comment"
        value={feedback.overallComment}
        onChange={(e) => onEditField(rowId, "overallComment", e.target.value)}
        multiline
        minRows={3}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { "aria-label": `Overall comment for ${displayName}` } }}
      />
      {/* The one control the sibling reply-row idiom has and this row
          lacked. The visible label is stable (WCAG 2.5.3 Label in Name) -
          only the icon and title swap on copy. */}
      <div className={styles.ghActions}>
        <Button
          size="small"
          variant="outlined"
          startIcon={copied ? <CheckIcon /> : <CopyIcon />}
          onClick={() => void handleCopyFeedback()}
          title={copied ? "Copied" : `Copy feedback for ${displayName}`}
          aria-label={`Copy feedback for ${displayName}`}
        >
          Copy feedback
        </Button>
      </div>
      {/* The visible label never swaps (WCAG 2.5.3), and the icon-only
          swap it does get is invisible to assistive tech - this
          throttle-free, single-fire live region announces the same
          confirmation for the same COPY_RESET_MS window the icon shows
          it. */}
      {copied && (
        <span role="status" aria-live="polite" style={visuallyHidden}>
          {`Copied feedback for ${displayName}`}
        </span>
      )}
    </>
  );
}
