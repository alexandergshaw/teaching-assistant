"use client";

import { formatNotQueuedList, type LedgerView } from "./ingestLedger";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";

/** Persistent ZIP intake status for the current session. */
export async function copyNotQueuedText(text: string, write: ((text: string) => Promise<void>) | undefined): Promise<boolean> {
  if (!write) return false;
  try { await write(text); return true; } catch { return false; }
}

export function LedgerNotice({ view }: { view: LedgerView }) {
  const [copyState, setCopyState] = useState<{ text: string; ok: boolean } | null>(null);
  if (!view.hasAny) return null;
  const text = formatNotQueuedList(view.skipped);
  const currentCopy = copyState?.text === text ? copyState : null;
  const copy = async () => {
    try {
      const clipboard = navigator.clipboard;
      setCopyState({ text, ok: await copyNotQueuedText(text, clipboard?.writeText?.bind(clipboard)) });
    } catch { setCopyState({ text, ok: false }); }
  };
  return (
    <Box className={controls.notice} aria-label="Submission intake ledger">
      {view.skipped.length > 0 && (
        <Box>
          <Typography component="p" className={styles.ghMeta}>{`Not queued: ${view.skipped.map((s) => `${s.student} (${s.reason})`).join("; ")}`}</Typography>
          <Typography component="p" className={styles.ghMeta}>This list is not saved. Copy it before starting a new session or reloading.</Typography>
          <Button size="small" variant="outlined" onClick={() => void copy()}>{currentCopy?.ok ? "Copied" : "Copy not queued list"}</Button>
          {currentCopy && !currentCopy.ok && <Typography component="p" role="alert" className={styles.ghMeta}>Copy failed. Select the list above and copy it manually.</Typography>}
        </Box>
      )}
      {view.linkNotFetched.length > 0 && (
        <Typography component="p" className={styles.ghMeta}>
          {`Link could not be fetched (graded on the link note): ${view.linkNotFetched.map((s) => s.student).join(", ")}`}
        </Typography>
      )}
      {view.failedFiles.length > 0 && (
        <Typography component="p" className={styles.ghMeta}>{`Files that could not be read: ${view.failedFiles.join(", ")}`}</Typography>
      )}
      {!view.accountedFor && (
        <Typography component="p" className={styles.ghMeta}>Some submissions are not accounted for. Check results and submit only missing work.</Typography>
      )}
    </Box>
  );
}
