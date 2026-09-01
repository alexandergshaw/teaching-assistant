"use client";

// The bulk-bar command box's proposal review modal
// (docs/llm-command-interface-acceptance-criteria.md, section 10 - THE FINAL
// CONTRACT; G1, G7, G12, G13, G14). Structural sibling of
// CarryModulePatternReviewModal.tsx (read in full before this was written):
// same ModalShell + previewHeader/previewMeta/previewContent/previewFooter
// grammar, same bulkRow/bulkField/bulkHint row language, mounted at
// ModulesView root (never inside the bulk bar - `.bulkBarBody`'s max-height
// ceiling and the sticky header's stacking-context trap forbid it, exactly as
// that file's own header explains) via ModulesViewSecondaryModals.tsx.
//
// THIS COMPONENT IS A THIN RENDERER. Every decision - which rows are
// applicable vs dropped (G14), each row's revertibility (G1), the exact bytes
// that will be sent (G13b) - was already computed by useCommandInterface.ts's
// pure helpers (buildCommandReviewRows, describeRowRevertibility,
// exactBytesForRow) from command-proposal.ts's own pure functions. Nothing
// here recomputes any of that; it only reads the hook's return value and
// renders it. Only ever mounted while `reviewVisible` is true (the same
// `isCommandReviewVisible` predicate that gates ModulesView.tsx's
// `commandProposalOpen` bulk-bar fact - see that hook's own header comment
// for why `reviewOpen` alone would not be enough).
//
// G13a - per-row opt-out: a bare MUI `Checkbox` (aria-labelled, no
// FormControlLabel wrapper), the same idiom CarryModulePatternReviewModal.tsx
// uses, rendered only for a "modify"/"create" row that is not dropped -
// there is nothing to opt out of on an "unsupported"/"already-present" row,
// since neither is ever sent to Canvas.
//
// G13b - the exact bytes: `row.exactBytes` (already run through
// `plainTextToPageHtml` for a "description" field by the hook) is rendered
// inside a plain `<code>` block as TEXT, never `dangerouslySetInnerHTML` -
// AssignmentPreviewModal.tsx's own preview idiom shows what HTML LOOKS like,
// which would hide exactly the markup differences CanvasSanitize acts on.
// Showing the markup, not the rendered result, is the point.
//
// G1 - revertibility: rendered as always-visible text (never a title
// tooltip, matching this tab's own E3 constraint every other Tier-1 modal
// already follows) directly under each applicable row - "Revertible from
// Canvas's page history" for a Page, "No reachable undo in Canvas" for
// everything else this app can write. Once a row's outcome lands and carries
// a `preImage` (an Assignment/Quiz/Discussion body, read immediately before
// the write - command-apply-outcome.ts's own G1 comment), it is rendered too,
// labelled as the one manual-revert record this app keeps for that type.
//
// VERIFICATION-PASS ADDITION (defect 8): a captured-and-discarded pre-image
// is weaker than G1 requires ("the only undo those types will ever have") -
// `outcomes` (useCommandInterface.ts) lives in useState and is wiped by the
// next "Review proposal" or a reload. The footer's two download buttons let
// the instructor get every landed row's result and pre-image out of the
// browser first, as a CSV or JSON file - `commandInterface.appliedLogCount`
// and `onDownloadAppliedLog` are both already-computed hook state; this
// component still recomputes nothing.
import { Button, Checkbox } from "@mui/material";
import styles from "../../../page.module.css";
import { ModalShell } from "../../ui/ModalShell";
import type { RefObject } from "react";
import type { CommandReviewRow, UseCommandInterfaceReturn } from "./useCommandInterface";

export interface CommandProposalModalProps {
  commandInterface: UseCommandInterfaceReturn;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}

const DECISION_LABEL: Record<CommandReviewRow["row"]["decision"], string> = {
  modify: "Modify",
  create: "Create module",
  "already-present": "Already present",
  unsupported: "Unsupported",
};

function revertibilityText(row: CommandReviewRow): string | null {
  if (row.revertibility === "page-history") return "Revertible from Canvas's page history.";
  if (row.revertibility === "no-reachable-undo") return "No reachable undo in Canvas - this app keeps the previous value below once applied.";
  return null;
}

function outcomeText(row: CommandReviewRow): string | null {
  const outcome = row.outcome;
  if (!outcome) return null;
  switch (outcome.status) {
    case "module-updated":
      return "Applied: module renamed.";
    case "module-created":
      return `Applied: module "${outcome.newModuleName}" created.`;
    case "item-updated":
      return "Applied.";
    case "refused":
      return `Refused: ${outcome.reason}`;
    case "not-found":
      return `Not found: ${outcome.reason}`;
    case "write-failed":
      return `Failed: ${outcome.reason}`;
    default:
      return null;
  }
}

function RowLabel({ row }: { row: CommandReviewRow }) {
  const target = row.row.target;
  const name = target ? target.displayName : row.row.proposedValue ?? "(new module)";
  const fieldLabel = row.row.field ?? "(no field)";
  return (
    <>
      <strong>{name}</strong>
      <span className={styles.bulkHint}>
        {target ? `${target.kind === "module" ? "module" : "item"} - ` : ""}
        {fieldLabel}
      </span>
    </>
  );
}

function ReviewRow({ row, onToggleOptOut }: { row: CommandReviewRow; onToggleOptOut: (index: number) => void }) {
  const applicableWrite = !row.dropped && (row.row.decision === "modify" || row.row.decision === "create");
  const revertText = applicableWrite ? revertibilityText(row) : null;
  const outcomeMsg = outcomeText(row);

  return (
    <li className={`${styles.bulkRow} ${styles.bulkRowStacked}`}>
      <div className={styles.bulkField}>
        {applicableWrite && (
          <Checkbox
            size="small"
            checked={!row.optedOut}
            onChange={() => onToggleOptOut(row.index)}
            aria-label={`Include this change to ${row.row.target?.displayName ?? row.row.proposedValue ?? "this row"} in the apply`}
          />
        )}
        <RowLabel row={row} />
        <span className={styles.bulkGroupTag}>{DECISION_LABEL[row.row.decision]}</span>
        {row.dropped && <span className={styles.bulkGroupTagDanger}>Dropped - selection changed</span>}
      </div>

      <div className={styles.carryReviewDetail}>
        {row.row.reason && <span className={styles.bulkHint}>{row.row.reason}</span>}

        {applicableWrite && (
          <>
            <span className={styles.bulkHint}>Current: {row.row.currentValue ?? "(unknown / not read)"}</span>
            <span className={styles.bulkHint}>Will be written to Canvas as:</span>
            <code style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "block" }}>{row.exactBytes ?? "(empty)"}</code>
            {revertText && <span className={styles.bulkHint}>{revertText}</span>}
          </>
        )}

        {outcomeMsg && (
          <span role="status" aria-live="polite" className={styles.bulkHint}>
            {outcomeMsg}
          </span>
        )}
        {row.outcome && row.outcome.status === "item-updated" && row.outcome.preImage !== null && (
          <>
            <span className={styles.bulkHint}>Previous value (this app&apos;s only record of it - Canvas keeps no history for this type):</span>
            <code style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "block" }}>{row.outcome.preImage}</code>
          </>
        )}
      </div>
    </li>
  );
}

export function CommandProposalModal({ commandInterface, restoreFocusRef, fallbackFocusRefs }: CommandProposalModalProps) {
  const { reviewRows, reconciliation, applyBusy, onApplyCommand, closeReview, onToggleOptOut, appliedLogCount, onDownloadAppliedLog } =
    commandInterface;
  const applicableCount = reviewRows.filter((r) => !r.dropped && (r.row.decision === "modify" || r.row.decision === "create")).length;
  const droppedCount = reconciliation?.droppedRows.length ?? 0;

  return (
    <ModalShell label="Command proposal" onDismiss={closeReview} restoreFocusRef={restoreFocusRef} fallbackFocusRefs={fallbackFocusRefs}>
      <div className={styles.previewHeader}>
        <div>
          <h3>Command proposal</h3>
          <p className={styles.previewMeta}>
            {applicableCount} change{applicableCount === 1 ? "" : "s"} ready to apply
            {droppedCount > 0 ? `, ${droppedCount} dropped (selection changed since this proposal was generated)` : ""}. Nothing is written until
            Apply is clicked, and any row can be excluded first.
          </p>
        </div>
        <Button size="small" onClick={closeReview} className={styles.previewCloseButton}>
          Close
        </Button>
      </div>

      <div className={styles.previewContent}>
        <ul className={styles.carryReviewList}>
          {reviewRows.map((row) => (
            <ReviewRow key={row.index} row={row} onToggleOptOut={onToggleOptOut} />
          ))}
        </ul>
        {reviewRows.length === 0 && <p className={styles.bulkHint}>The model proposed no changes for this command.</p>}
        {appliedLogCount > 0 && (
          <p className={styles.bulkHint}>
            {appliedLogCount} applied row{appliedLogCount === 1 ? "" : "s"} can be downloaded below with its previous value - this app&apos;s
            only record of it once this modal closes or the page reloads.
          </p>
        )}
      </div>

      <div className={styles.previewFooter}>
        <Button variant="text" size="small" onClick={() => onDownloadAppliedLog("csv")} disabled={appliedLogCount === 0}>
          Download applied log (CSV)
        </Button>
        <Button variant="text" size="small" onClick={() => onDownloadAppliedLog("json")} disabled={appliedLogCount === 0}>
          Download applied log (JSON)
        </Button>
        <Button variant="outlined" size="small" onClick={closeReview} disabled={applyBusy}>
          Close
        </Button>
        <Button variant="contained" size="small" onClick={onApplyCommand} disabled={applyBusy}>
          {applyBusy ? "Applying…" : "Apply"}
        </Button>
      </div>
    </ModalShell>
  );
}
