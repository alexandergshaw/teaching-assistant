"use client";

// DET-Wave 3 (docs/grading-recording-detection-reliability-scope.md, Change 4):
// the recovery for a post the capture missed - the instructor types the poster
// name and pastes the post text, and the row grades like any other. A leaf
// (GradingRecordingPanel.tsx sits at the 1000-line ceiling); the mint, the
// course/assessment stamp and the roster match all happen in
// useGradingRows.addManualRow, which this only calls.
//
// Draft text is deliberately NOT persisted: the scope adds no new storage key
// for this change (grading-rows.test.ts pins the exact persisted-key set), and
// the draft is a few seconds of typing that becomes a persisted row on Add.
// Both buttons are outlined, so buttonVariant.test.ts's primary count for this
// directory is unchanged.

import { useState } from "react";
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";

export default function GradingManualAdd({ onAdd }: { onAdd: (studentName: string, submissionText: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  if (!open) {
    return (
      <div className={styles.ghActions}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            setAdded(null);
            setOpen(true);
          }}
        >
          Add a missed post
        </Button>
        {added && (
          <span role="status" aria-live="polite" className={styles.fieldHint}>
            {added}
          </span>
        )}
      </div>
    );
  }

  const close = () => {
    setOpen(false);
    setName("");
    setText("");
  };

  return (
    <form
      className={styles.field}
      onSubmit={(e) => {
        e.preventDefault();
        if (!onAdd(name, text)) return;
        setAdded(`Added a post${name.trim() ? ` by ${name.trim()}` : ""}. It is in the table below.`);
        close();
      }}
    >
      <TextField
        size="small"
        label="Poster name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={controls.fieldMd}
        autoFocus
      />
      <TextField
        size="small"
        label="Post text"
        placeholder="Paste or type the post the capture missed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        multiline
        minRows={3}
        fullWidth
      />
      <div className={styles.ghActions}>
        <Button size="small" variant="outlined" type="submit" disabled={name.trim() === "" && text.trim() === ""}>
          Add post
        </Button>
        <Button size="small" variant="text" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
