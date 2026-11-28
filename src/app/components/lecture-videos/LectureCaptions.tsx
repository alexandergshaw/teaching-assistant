"use client";

import { useMemo, useState } from "react";
import { Alert, Button, LinearProgress, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { renderNarratedVideo } from "@/lib/narrate-video";
import { LectureDownloadButton } from "./LectureDownloads";
import { Section, UploadButton, focusLectureSection } from "./lectureControls";
import {
  drawLectureCaption, lectureCaptionCues, lectureCaptionError, lectureCaptionMode, lectureCaptionRenderSource,
  MAX_CAPTION_CUES, MAX_CAPTION_FILE_BYTES, MAX_CAPTION_TEXT, parseLectureCaptionFile,
  type LectureCaptionDraft, type LectureCaptionSettings,
} from "./lecture-captions";
import { lectureCaptionAudioSource, transcribeLectureCaptions } from "./lecture-caption-transcription";
import type { LectureDownload } from "./lecture-downloads";
import type { LecturePart } from "./lectureProject";

type Props = {
  part: LecturePart;
  disabled: boolean;
  update: (change: (part: LecturePart) => LecturePart) => void;
  run: (label: string, task: (signal: AbortSignal) => Promise<void>) => void;
  confirm: (title: string, message: string, action: () => void, trigger: HTMLElement | null) => void;
  downloads: LectureDownload[];
};

export default function LectureCaptions({ part, disabled, update, run, confirm, downloads }: Props) {
  const [progress, setProgress] = useState<string | null>(null);
  const [burnProgress, setBurnProgress] = useState<number | null>(null);
  const mode = lectureCaptionMode(part);
  const custom = part.captions?.custom ?? [];
  const error = lectureCaptionError(part);
  const cues = useMemo(() => lectureCaptionCues(part), [part]);
  const audio = lectureCaptionAudioSource(part);

  function setMode(next: LectureCaptionSettings["mode"]) {
    update((previous) => ({ ...previous, captions: { ...previous.captions, mode: next } }));
  }

  function changeCustom(change: (captions: LectureCaptionDraft[]) => LectureCaptionDraft[]) {
    update((previous) => ({ ...previous, captions: { mode: "custom", custom: change(previous.captions?.custom ?? []) } }));
  }

  function replaceCustom(action: () => void, trigger: HTMLElement | null) {
    if (custom.length) confirm("Replace custom captions?", "This replaces the editable captions for this part.", action, trigger);
    else action();
  }

  function importCaptions(file: File, trigger: HTMLElement) {
    replaceCustom(() => {
      run("Importing captions", async (signal) => {
        if (file.size > MAX_CAPTION_FILE_BYTES) throw new Error("Choose a caption file under 256 KB.");
        const drafts = parseLectureCaptionFile(await file.text(), file.name);
        signal.throwIfAborted();
        changeCustom(() => drafts);
      });
    }, trigger);
  }

  function transcribe(trigger: HTMLElement) {
    if (!audio) return;
    replaceCustom(() => {
      run("Transcribing audible audio", async (signal) => {
        try {
          const drafts = await transcribeLectureCaptions(audio, signal, setProgress);
          signal.throwIfAborted();
          changeCustom(() => drafts);
        } finally {
          setProgress(null);
        }
      });
    }, trigger);
  }

  function addCue() {
    changeCustom((previous) => {
      if (previous.length >= MAX_CAPTION_CUES) return previous;
      const latest = Math.max(0, ...previous.map((draft) => Number(draft.end) || 0));
      const start = latest >= part.duration - 0.1 ? 0 : latest;
      const end = Math.min(part.duration, start + 4);
      return [...previous, { id: crypto.randomUUID(), start: String(start), end: String(end), text: "" }];
    });
  }

  function editCue(id: string, field: "start" | "end" | "text", value: string) {
    changeCustom((previous) => previous.map((draft) => draft.id === id ? { ...draft, [field]: value } : draft));
  }

  function burn(version: "original" | "narrated") {
    const source = lectureCaptionRenderSource(part, version);
    if (!source || !cues.length) return;
    run(`Burning captions into the ${version} video`, async (signal) => {
      const audioContext = new AudioContext();
      setBurnProgress(0);
      try {
        await audioContext.resume();
        signal.throwIfAborted();
        const blob = await renderNarratedVideo(source, [], "mix", setBurnProgress, {
          audioContext, strict: true, signal,
          drawOverlay: (ctx, timeSec) => drawLectureCaption(ctx, cues, timeSec),
        });
        signal.throwIfAborted();
        if (!blob.size) throw new Error("The browser did not produce a captioned video.");
        const field = version === "original" ? "captionedOriginal" : "captionedNarrated";
        update((previous) => ({ ...previous, [field]: blob }));
      } finally {
        setBurnProgress(null);
        if (audioContext.state !== "closed") await audioContext.close();
      }
    });
  }

  const vttDownload = downloads.find((file) => file.kind === "captions");
  const originalDownload = downloads.find((file) => file.kind === "captioned-original");
  const narratedDownload = downloads.find((file) => file.kind === "captioned-narrated");

  return <Section title="Captions" id="lecture-captions">
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} useFlexGap sx={{ flexWrap: "wrap" }}>
      <TextField select size="small" label="Caption track" value={mode} disabled={disabled} onChange={(event) => setMode(event.target.value as LectureCaptionSettings["mode"])}>
        <MenuItem value="off">Off</MenuItem>
        {part.audioMode === "cues" && <MenuItem value="narration">From voiced narration cues</MenuItem>}
        <MenuItem value="custom">Custom captions</MenuItem>
      </TextField>
      <UploadButton label="Import SRT or VTT" accept=".srt,.vtt,text/vtt,application/x-subrip" disabled={disabled}
        onFiles={([file], input) => importCaptions(file, input)} />
      <Button variant="outlined" disabled={disabled || !audio} onClick={(event) => transcribe(event.currentTarget)}>Transcribe audible audio</Button>
    </Stack>
    {!audio && <Typography variant="body2" color="text.secondary">Render the narrated audio mix before transcribing it.</Typography>}
    {progress && <Typography role="status" variant="body2">{progress}</Typography>}
    {error && <Alert severity="warning">{error}</Alert>}
    {mode !== "off" && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      <Button variant="outlined" disabled={disabled || !cues.length} onClick={() => burn("original")}>Make captioned copy of original</Button>
      {part.audioMode !== "source" && <Button variant="outlined" disabled={disabled || !part.output || !cues.length}
        onClick={() => burn("narrated")}>Make captioned copy with narration</Button>}
      {vttDownload && <LectureDownloadButton file={vttDownload} label="Download captions (VTT)" disabled={disabled} />}
      {originalDownload && <LectureDownloadButton file={originalDownload} label="Download captioned original" disabled={disabled} />}
      {narratedDownload && <LectureDownloadButton file={narratedDownload} label="Download captioned narrated video" disabled={disabled} />}
    </Stack>}
    {mode !== "off" && cues.length > 0 && part.audioMode !== "source" && !part.output && (
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body2" color="text.secondary">Render the narration video before burning captions into that version.</Typography>
        <Button size="small" aria-controls="lecture-export" onClick={() => focusLectureSection("lecture-export")}>Open narration export</Button>
      </Stack>
    )}
    {burnProgress !== null && <LinearProgress aria-label="Burning captions into video" variant="determinate" value={burnProgress} />}
    {mode === "custom" && <>
      <Typography variant="body2" color="text.secondary">Review automatic caption timing against the audible track before exporting.</Typography>
      <Button variant="outlined" disabled={disabled || custom.length >= MAX_CAPTION_CUES} onClick={addCue} sx={{ alignSelf: "flex-start" }}>Add caption</Button>
      {custom.map((draft, index) => <Paper variant="outlined" sx={{ p: 1.5 }} key={draft.id}>
        <Stack spacing={1}>
          <TextField multiline size="small" label={`Caption ${index + 1}`} value={draft.text} disabled={disabled}
            slotProps={{ htmlInput: { maxLength: MAX_CAPTION_TEXT } }} onChange={(event) => editCue(draft.id, "text", event.target.value)} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField type="number" size="small" label={`Caption ${index + 1} start (seconds)`} value={draft.start} disabled={disabled}
              slotProps={{ htmlInput: { min: 0, max: part.duration, step: "any" } }} onChange={(event) => editCue(draft.id, "start", event.target.value)} />
            <TextField type="number" size="small" label={`Caption ${index + 1} end (seconds)`} value={draft.end} disabled={disabled}
              slotProps={{ htmlInput: { min: 0, max: part.duration, step: "any" } }} onChange={(event) => editCue(draft.id, "end", event.target.value)} />
            <Button color="error" disabled={disabled} aria-label={`Remove caption ${index + 1}`} onClick={() => changeCustom((drafts) => drafts.filter((cue) => cue.id !== draft.id))}>Remove</Button>
          </Stack>
        </Stack>
      </Paper>)}
    </>}
  </Section>;
}
