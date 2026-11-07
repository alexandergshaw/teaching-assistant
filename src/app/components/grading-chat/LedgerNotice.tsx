"use client";

import type { LedgerView } from "./ingestLedger";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";

/** Persistent ZIP intake status for the current session. */
export function LedgerNotice({ view }: { view: LedgerView }) {
  if (!view.hasAny) return null;
  return (
    <div className={controls.notice} aria-label="Zip ingest ledger">
      {view.skipped.length > 0 && (
        <p className={styles.ghMeta}>
          {`Skipped (too large): ${view.skipped.map((s) => `${s.student} (${s.reason})`).join("; ")}`}
        </p>
      )}
      {view.linkNotFetched.length > 0 && (
        <p className={styles.ghMeta}>
          {`Link could not be fetched (graded on the link note): ${view.linkNotFetched.map((s) => s.student).join(", ")}`}
        </p>
      )}
      {view.failedFiles.length > 0 && (
        <p className={styles.ghMeta}>{`Files that could not be read: ${view.failedFiles.join(", ")}`}</p>
      )}
      {!view.accountedFor && (
        <p className={styles.ghMeta}>Some students in the zip are not accounted for. Re-upload the zip to check.</p>
      )}
    </div>
  );
}
