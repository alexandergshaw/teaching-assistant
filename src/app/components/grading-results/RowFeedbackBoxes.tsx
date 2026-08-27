"use client";

// The three independently-editable, independently-copyable feedback boxes
// per grading-results row (A2, docs/grading-results-feedback-boxes-
// acceptance-criteria.md): what the student did well, what they could do
// better, and the resubmission note. Split out of GradingResults.tsx into
// its own component because that file was already 822 of the project's
// 1000-line-per-file cap before this feature, and the three-box group
// (three TextFields, three copy controls, three expand controls, one
// "copy all" control, each needing a distinct accessible name) does not fit
// in the remaining headroom.
//
// CopyIcon/ExpandIcon below are deliberately duplicated from
// GradingResults.tsx rather than imported from it: this feature's file set
// is fixed to GradingResults.tsx, this file, and their helpers files, so
// there is no shared icons module to import from, and importing them back
// from GradingResults.tsx (which already imports this file to render it)
// would create a circular module dependency. Two tiny stateless SVG
// components are cheap to duplicate; keep them byte-for-byte identical to
// GradingResults.tsx's copies if either ever changes.

import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import styles from "../../page.module.css";
import {
  FEEDBACK_FIELDS,
  FEEDBACK_FIELD_META,
  formatFeedback,
  type FeedbackBoxesEdit,
  type FeedbackField,
} from "./gradingResultsHelpers";

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3 3.75A.75.75 0 0 1 3.75 3h4a.75.75 0 0 1 0 1.5H5.56l3.22 3.22a.75.75 0 1 1-1.06 1.06L4.5 5.56v2.19a.75.75 0 0 1-1.5 0v-4Zm14 12.5a.75.75 0 0 1-.75.75h-4a.75.75 0 0 1 0-1.5h2.19l-3.22-3.22a.75.75 0 1 1 1.06-1.06l3.22 3.22V12.25a.75.75 0 0 1 1.5 0v4Z" />
    </svg>
  );
}

export interface RowFeedbackBoxesProps {
  student: string;
  edit: FeedbackBoxesEdit;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  onChangeField: (field: FeedbackField, value: string) => void;
  onExpand: (field: FeedbackField) => void;
  /**
   * Prefixes every accessible name with this text ahead of the descriptor -
   * "Copy the ${namePrefix} ${descriptor} for ${student}" instead of the
   * default "Copy ${descriptor} for ${student}" - so a surface that shows
   * MANY subjects at once, each split further into multiple named columns
   * (Repo Grades: many repos, each with several assignment-folder columns),
   * can distinguish two cells that would otherwise render an identically-
   * worded control. Omitted (the default, `undefined`) reproduces
   * GradingResults.tsx's original wording byte-for-byte - this prop exists so
   * ONE component serves both surfaces rather than forking a second copy of
   * every label (see RepoGradeCellControl.tsx's own render site for the
   * repo-grades caller, which passes `column.folder` here).
   */
  namePrefix?: string;
}

/**
 * Three independently-editable, independently-copyable feedback boxes for one
 * grading-results row, plus one control that copies all three composed
 * together (AC item 10 - the common case must not cost triple the clicks).
 * Every copy/expand control's accessible name carries both the box identity
 * and the student name (AC item 7): many rows, three boxes each, can be on
 * screen at once, and an ambiguous name makes the page unusable with a
 * screen reader. `namePrefix` (see its own doc comment above) extends that
 * same guarantee to a surface that also needs a THIRD identifying fact.
 */
export function RowFeedbackBoxes({
  student,
  edit,
  copiedKey,
  onCopy,
  onChangeField,
  onExpand,
  namePrefix,
}: RowFeedbackBoxesProps) {
  const allKey = `${student}-all-feedback`;
  const allCopied = copiedKey === allKey;
  const copyAllLabel = namePrefix ? `Copy all ${namePrefix} feedback for ${student}` : `Copy all feedback for ${student}`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="text"
          size="small"
          onClick={() => onCopy(allKey, formatFeedback(edit.overall || "No feedback provided."))}
          aria-label={allCopied ? "Copied" : copyAllLabel}
          sx={{ textTransform: "none", minWidth: 0, p: "2px 6px" }}
        >
          {allCopied ? "Copied" : "Copy all feedback"}
        </Button>
      </div>
      {FEEDBACK_FIELDS.map((field) => {
        const meta = FEEDBACK_FIELD_META[field];
        const key = `${student}-${field}`;
        const copied = copiedKey === key;
        const copyLabel = namePrefix
          ? `Copy the ${namePrefix} ${meta.descriptorLower} for ${student}`
          : `Copy ${meta.descriptorLower} for ${student}`;
        const expandLabel = namePrefix
          ? `Expand the ${namePrefix} ${meta.descriptorLower} for ${student}`
          : `Expand ${meta.descriptorLower} for ${student}`;
        const fieldAriaLabel = namePrefix
          ? `${namePrefix} ${meta.descriptorLower} for ${student}`
          : `${meta.descriptorCapitalized} for ${student}`;
        return (
          <div key={field} className={styles.overallFeedbackWrap} style={{ marginTop: 6 }}>
            <IconButton
              size="small"
              title={copied ? "Copied" : meta.copyTitle}
              aria-label={copied ? "Copied" : copyLabel}
              onClick={() => onCopy(key, formatFeedback(edit[field] || meta.emptyCopyFallback))}
            >
              <CopyIcon />
            </IconButton>
            <IconButton size="small" title="Expand feedback" aria-label={expandLabel} onClick={() => onExpand(field)}>
              <ExpandIcon />
            </IconButton>
            <TextField
              multiline
              label={meta.fieldLabel}
              value={edit[field]}
              onChange={(event) => onChangeField(field, event.target.value)}
              aria-label={fieldAriaLabel}
              placeholder={field === "resubmitNotice" ? "No resubmission note - full credit" : undefined}
              fullWidth
              size="small"
              minRows={2}
            />
          </div>
        );
      })}
    </div>
  );
}

export default RowFeedbackBoxes;
