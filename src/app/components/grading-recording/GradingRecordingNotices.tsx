"use client";

// Wave 1 of the recording-grader UX overhaul: the notices region extracted out
// of GradingRecordingPanel.tsx (that file sat at exactly the 1000-line
// ceiling). Purely presentational - every value and handler arrives as a prop.
//
// ONE wrapper carries role="status"/aria-live - no role on the individual
// notices (CC11): several extraction outcomes can arrive close together, and N
// simultaneous role="alert" elements each queue their own interruption.
// The dropped-frames notice, the frame-encode notice and a failed-grade error
// all live here so every notice on this surface is in the one place an
// instructor already knows to look.
//
// REGRESSION 383: `droppedFramesTotal` is the SESSION total folded through
// accumulateDroppedFrames in the panel, never the hook's live per-Start
// counter. The droppedFramesTotal gate below is the exact one
// GradingRecordingPanel.wiring.test.ts pins - now against THIS file - and the
// panel's droppedFramesTotal binding on this element is pinned there too.
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { isDangerNotice, type GradingExtractionOutcome } from "./grading-extraction-outcome";
import type { GradingExtractionLedger } from "./grading-extraction-ledger";
import { coverageGapNotice, ledgerUnreadNotice } from "./grading-coverage-notices";

export interface GradingRecordingNotice extends GradingExtractionOutcome {
  id: string;
}

export default function GradingRecordingNotices({
  droppedFramesTotal,
  coverageGapCount,
  ledger,
  frameEncodeNotice,
  gradeError,
  rowError,
  notices,
  onDismiss,
}: {
  droppedFramesTotal: number;
  coverageGapCount: number;
  ledger: GradingExtractionLedger;
  frameEncodeNotice: string | null;
  gradeError: string | null;
  rowError: string | null | undefined;
  notices: GradingRecordingNotice[];
  onDismiss: (id: string) => void;
}) {
  const gapText = coverageGapNotice(coverageGapCount);
  const unreadText = ledgerUnreadNotice(ledger);
  if (!(droppedFramesTotal > 0 || gapText || unreadText || frameEncodeNotice || gradeError || rowError || notices.length > 0)) return null;
  return (
    <div role="status" aria-live="polite" className={styles.field}>
      {droppedFramesTotal > 0 && (
        <p className={`${controls.notice} ${controls.noticeDanger}`}>
          Reading fell behind the capture, so some frames were skipped. Scroll back over that section to catch it.
        </p>
      )}
      {gapText && <p className={`${controls.notice} ${controls.noticeDanger}`}>{gapText}</p>}
      {unreadText && <p className={`${controls.notice} ${controls.noticeDanger}`}>{unreadText}</p>}
      {frameEncodeNotice && <p className={`${controls.notice} ${controls.noticeDanger}`}>{frameEncodeNotice}</p>}
      {gradeError && <p className={`${controls.notice} ${controls.noticeDanger}`}>{gradeError}</p>}
      {/* The single-row grade path's own refusal/error - kept separate from
          `gradeError` (the bulk path's) so neither clobbers the other, and
          surfaced through the SAME notice region rather than a second live
          region (docs/a38-scope.md section 4.5's "no new live region" rule). */}
      {rowError && <p className={`${controls.notice} ${controls.noticeDanger}`}>{rowError}</p>}
      {notices.map((n) => (
        <p key={n.id} className={isDangerNotice(n.kind) ? `${controls.notice} ${controls.noticeDanger}` : controls.notice}>
          {n.text}{" "}
          <button type="button" className={styles.linkButton} onClick={() => onDismiss(n.id)}>
            Dismiss
          </button>
        </p>
      ))}
    </div>
  );
}
