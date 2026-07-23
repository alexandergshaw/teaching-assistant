"use client";

import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";

type LessonPlanPreviewRevisionProps = {
  revisionPrompt: string;
  isRegenerating: boolean;
  onRevisionPromptChange: (value: string) => void;
  onRegenerate: () => Promise<void>;
};

export default function LessonPlanPreviewRevision({
  revisionPrompt,
  isRegenerating,
  onRevisionPromptChange,
  onRegenerate,
}: LessonPlanPreviewRevisionProps) {
  return (
    <div className={styles.lessonRevisionRow}>
      <TextField
        fullWidth
        multiline
        minRows={2}
        size="small"
        placeholder="Revision instructions — e.g. add a slide on X, make analogies more sports-focused, shorten slide 3…"
        value={revisionPrompt}
        onChange={(event) => onRevisionPromptChange(event.target.value)}
      />
      <Button
        variant="contained"
        size="small"
        onClick={onRegenerate}
        disabled={isRegenerating}
      >
        {isRegenerating ? "Regenerating..." : "Regenerate"}
      </Button>
    </div>
  );
}
