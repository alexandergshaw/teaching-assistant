"use client";

// RECORDING ONE-VS-MANY W2 (docs/recording-one-vs-many-scope.md section 3.2):
// the confirm card. When the classifier says an uploaded recording holds
// SEVERAL students' submissions, nothing is graded until the instructor chooses:
// grade each detected segment as its own student row, or grade the whole
// recording as one. Presentation only; the decision lives in the driver.
import Button from "@mui/material/Button";
import { formatRecordingWindow } from "@/lib/grade/recording-split";
import type { PendingSplit } from "./recordingSplitDriver";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import chatStyles from "./grading-chat.module.css";

export interface RecordingSplitConfirmProps {
  readonly pending: PendingSplit;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
}

export function RecordingSplitConfirm({ pending, onConfirm, onReject }: RecordingSplitConfirmProps) {
  const count = pending.segments.length;
  return (
    <div className={controls.notice} role="group" aria-label="Confirm recording split">
      <p className={styles.loadingTitle}>{`This recording looks like ${count} submissions`}</p>
      <p className={styles.ghMeta}>{`${pending.name} - check the segments below before anything is graded.`}</p>
      <ol className={chatStyles.splitList}>
        {pending.segments.map((segment, index) => (
          <li key={`${segment.startSec}-${index}`}>{`${segment.label} (${formatRecordingWindow(segment)})`}</li>
        ))}
      </ol>
      <div className={chatStyles.splitActions}>
        <Button variant="contained" size="small" onClick={onConfirm}>
          {`Grade as ${count} submissions`}
        </Button>
        <Button variant="outlined" size="small" onClick={onReject}>
          Grade as one
        </Button>
      </div>
    </div>
  );
}

export default RecordingSplitConfirm;
