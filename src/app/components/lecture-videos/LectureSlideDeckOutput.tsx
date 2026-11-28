"use client";

import { useRef, useState } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { Section } from "./lectureControls";
import { buildLectureRecordingDeck, lectureSlideDeckBlocker } from "./lecture-recording-deck";
import { partName, type LecturePart, type LectureProject } from "./lectureProject";
import type { RunLectureTask } from "./LecturePartEditor";

export default function LectureSlideDeckOutput({ part, project, index, disabled, update, run }: {
  part: LecturePart;
  project: LectureProject;
  index: number;
  disabled: boolean;
  update: (change: (part: LecturePart) => LecturePart) => void;
  run: RunLectureTask;
}) {
  const [progress, setProgress] = useState("");
  const generation = useRef(0);
  const blocker = lectureSlideDeckBlocker(part);
  const deck = part.slideDeck;

  function generate() {
    run(`Generating slides for ${partName(part, index)}`, async (signal) => {
      const attempt = ++generation.current;
      const clearProgress = () => {
        if (generation.current === attempt) setProgress("");
      };
      signal.addEventListener("abort", clearProgress, { once: true });
      try {
        const slideDeck = await buildLectureRecordingDeck(part, index, project, signal, (message) => {
          if (!signal.aborted && generation.current === attempt) setProgress(message);
        });
        signal.throwIfAborted();
        update((previous) => ({ ...previous, slideDeck }));
      } finally {
        signal.removeEventListener("abort", clearProgress);
        clearProgress();
      }
    });
  }

  return <Section title="Slide deck">
    <Typography variant="body2" color="text.secondary">Create an editable PowerPoint from this recording’s original audio, visible content, and project materials.</Typography>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      <Button variant="outlined" disabled={disabled || Boolean(blocker)} onClick={generate}>
        {deck ? "Regenerate slide deck" : "Generate slide deck"}
      </Button>
      {deck && <Button href="#lecture-downloads">Open downloads</Button>}
    </Stack>
    {blocker && <Typography variant="body2" color="text.secondary">{blocker}</Typography>}
    {progress && <Typography role="status" variant="body2">{progress}</Typography>}
    {deck && <Typography variant="body2">PowerPoint ready · {deck.title}</Typography>}
    {deck?.warnings.map((message) => <Alert severity="info" key={message}>{message}</Alert>)}
  </Section>;
}
