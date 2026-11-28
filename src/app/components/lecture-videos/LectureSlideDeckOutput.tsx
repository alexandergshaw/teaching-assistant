"use client";

import { useRef, useState } from "react";
import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { LectureDownloadButton } from "./LectureDownloads";
import type { LectureDownload } from "./lecture-downloads";
import { Section } from "./lectureControls";
import { buildLectureRecordingDeck, lectureSlideDeckBlocker } from "./lecture-recording-deck";
import { partName, type LecturePart, type LectureProject } from "./lectureProject";
import type { RunLectureTask } from "./LecturePartEditor";
import type { LectureDeckBranding } from "./lecture-deck-branding";
import type { LectureInstitutionDecks } from "./useLectureInstitutionDecks";

export default function LectureSlideDeckOutput({ part, project, index, disabled, update, run, download, institutionDecks, onBrandingChange }: {
  part: LecturePart;
  project: LectureProject;
  index: number;
  disabled: boolean;
  update: (change: (part: LecturePart) => LecturePart) => void;
  run: RunLectureTask;
  download?: LectureDownload;
  institutionDecks: LectureInstitutionDecks;
  onBrandingChange: (value: LectureDeckBranding | undefined) => void;
}) {
  const [progress, setProgress] = useState("");
  const generation = useRef(0);
  const blocker = lectureSlideDeckBlocker(part);
  const deck = part.slideDeck;
  const branding = project.slideDeckBranding;
  const selectedTemplate = branding ? `${branding.acronym}:${branding.fileId}` : "";
  const missing = !!branding && !institutionDecks.files.some((file) => file.acronym === branding.acronym && file.id === branding.fileId);
  const brandingBlocked = !!branding && (institutionDecks.loading || !!institutionDecks.error || missing);

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
        }, undefined, institutionDecks.account);
        signal.throwIfAborted();
        update((previous) => ({ ...previous, slideDeck }));
      } finally {
        signal.removeEventListener("abort", clearProgress);
        clearProgress();
      }
    });
  }

  return <Section title="Slide deck" id="lecture-slides">
    <Typography variant="body2" color="text.secondary">Create an editable PowerPoint from this recording’s original audio, visible content, and project materials.</Typography>
    <TextField select size="small" label="PowerPoint template" value={selectedTemplate} disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        const file = institutionDecks.files.find((item) => `${item.acronym}:${item.id}` === value);
        if (!value || file) onBrandingChange(file ? { acronym: file.acronym, fileId: file.id, fileName: file.name } : undefined);
      }}>
      <MenuItem value="">Standard PowerPoint</MenuItem>
      {branding && missing && <MenuItem value={selectedTemplate} disabled>{branding.acronym} · {branding.fileName}</MenuItem>}
      {institutionDecks.files.map((file) => <MenuItem key={`${file.acronym}:${file.id}`} value={`${file.acronym}:${file.id}`}>
        {file.acronym} · {file.name}
      </MenuItem>)}
    </TextField>
    {institutionDecks.loading && <Typography role="status" variant="body2">Checking for institution templates…</Typography>}
    {!institutionDecks.loading && institutionDecks.error && <Alert severity="warning" action={
      <Button size="small" disabled={disabled} onClick={institutionDecks.refresh}>Retry</Button>
    }>{institutionDecks.error}</Alert>}
    {!institutionDecks.loading && !institutionDecks.error && missing && <Alert severity="warning">
      The selected institution template is no longer available. Choose another template or Standard PowerPoint.
    </Alert>}
    {!institutionDecks.loading && !institutionDecks.error && !missing && !institutionDecks.files.length && (
      <Typography variant="body2" color="text.secondary">Add a PowerPoint under Institutions to use its branding here.</Typography>
    )}
    {branding && !brandingBlocked && <Typography variant="body2" color="text.secondary">
      This template applies to slide decks generated from any recording in this project.
    </Typography>}
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      <Button variant="outlined" disabled={disabled || Boolean(blocker) || brandingBlocked} onClick={generate}>
        {deck ? "Regenerate slide deck" : "Generate slide deck"}
      </Button>
      {download && <LectureDownloadButton file={download} label="Download PowerPoint" disabled={disabled} />}
    </Stack>
    {blocker && <Typography variant="body2" color="text.secondary">{blocker}</Typography>}
    {progress && <Typography role="status" variant="body2">{progress}</Typography>}
    {deck && <Typography variant="body2">Last generated PowerPoint · {deck.title}
      {deck.branding && ` · ${deck.branding.acronym} · ${deck.branding.fileName}`}
    </Typography>}
    {deck?.warnings.map((message) => <Alert severity="info" key={message}>{message}</Alert>)}
  </Section>;
}
