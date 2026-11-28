"use client";

import { useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Divider, FormControlLabel, LinearProgress, MenuItem, Paper, Stack, Switch, TextField, Typography } from "@mui/material";
import { renderNarratedVideo, type NarrationClip } from "@/lib/narrate-video";
import LectureCaptions from "./LectureCaptions";
import LectureSlideDeckOutput from "./LectureSlideDeckOutput";
import { narrationWavBlocker, prepareLectureNarrationWav } from "./lecture-export-audio";
import { AudioPlayer, Section, UploadButton, useBlobUrl } from "./lectureControls";
import { lectureCaptionBlob } from "./lecture-captions";
import { audioFromBlob, readBase64 } from "./lectureMedia";
import { assignCues, changePartCue, cueTimingError, missingCueVoices, partName, renderBlocker, type LectureCue, type LecturePart, type LectureProject } from "./lectureProject";
import { draftPartCues, synthesizeCue } from "./lectureWorkflow";

export type RunLectureTask = (label: string, task: (signal: AbortSignal) => Promise<void>) => void;

type Props = {
  part: LecturePart;
  project: LectureProject;
  index: number;
  disabled: boolean;
  update: (change: (part: LecturePart) => LecturePart) => void;
  run: RunLectureTask;
  confirm: (title: string, message: string, action: () => void, trigger: HTMLElement | null) => void;
};

export default function LecturePartEditor({ part, project, index, disabled, update, run, confirm }: Props) {
  const sourceUrl = useBlobUrl(part.source);
  const outputUrl = useBlobUrl(part.output);
  const captionFile = useMemo(() => lectureCaptionBlob(part), [part]);
  const captionUrl = useBlobUrl(captionFile);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const name = partName(part, index);
  const blocker = renderBlocker(part);
  const originalAudioOnly = part.audioMode === "source";
  const audioCount = part.cues.filter((cue) => cue.audio).length;
  const lastVoiceEnd = Math.max(0, ...part.cues.map((cue) => cue.audio ? Number(cue.start) + cue.audio.duration : 0));
  const silentTail = part.duration - lastVoiceEnd;

  function changeCue(id: string, change: (cue: LectureCue) => LectureCue) {
    update((previous) => changePartCue(previous, id, change));
  }

  function draft() {
    run(`Drafting cues for ${name}`, async (signal) => {
      const cues = await draftPartCues(part, index, project, signal);
      update((previous) => assignCues(previous, cues));
    });
  }

  function generate(cues: LectureCue[]) {
    if (project.voiceSelectionRequired) return;
    run(`Generating ElevenLabs audio for ${name}`, async (signal) => {
      for (const cue of cues) {
        const audio = await synthesizeCue(cue, project.voice?.id, signal);
        changeCue(cue.id, (previous) => ({ ...previous, audio }));
      }
    });
  }

  function importTake(file: File) {
    run(`Checking ${file.name}`, async (signal) => {
      const take = await audioFromBlob(file, file.name);
      signal.throwIfAborted();
      update((previous) => ({ ...previous, take, audioMode: "take", output: undefined }));
    });
  }

  function render() {
    if (originalAudioOnly || blocker) return;
    run(`Rendering ${name}`, async (signal) => {
      const audioContext = new AudioContext();
      setProgress(0);
      try {
        await audioContext.resume();
        const entries = part.audioMode === "take"
          ? [{ start: 0, audio: part.take }]
          : part.cues.map((cue) => ({ start: Number(cue.start), audio: cue.audio }));
        const clips: NarrationClip[] = [];
        for (const { start, audio } of entries) {
          if (!audio) throw new Error("The narration audio is missing.");
          clips.push({ startSec: start, base64: await readBase64(audio.blob), mimeType: audio.blob.type });
          signal.throwIfAborted();
        }
        const mode = part.mixSourceAudio ? "mix" : "replace";
        const output = await renderNarratedVideo(part.source, clips, mode, setProgress, { audioContext, strict: true, signal });
        signal.throwIfAborted();
        if (!output.size) throw new Error("The browser did not produce a video.");
        update((previous) => ({ ...previous, output }));
      } finally {
        setProgress(null);
        if (audioContext.state !== "closed") await audioContext.close();
      }
    });
  }

  function addCue() {
    const previousEnd = Math.max(0, ...part.cues.map((cue) => Number(cue.end) || 0));
    const atEnd = previousEnd >= part.duration;
    const start = atEnd ? 0 : previousEnd;
    const end = Math.min(part.duration, start + 10);
    update((previous) => ({
      ...previous,
      cues: [...previous.cues, { id: crypto.randomUUID(), start: String(start), end: String(Math.round(end * 1000) / 1000), text: "" }],
      output: previous.audioMode === "cues" ? undefined : previous.output,
    }));
  }

  function prepareNarrationWav() {
    run(`Preparing narration WAV for ${name}`, async (signal) => {
      const narrationWav = await prepareLectureNarrationWav(part, signal);
      update((previous) => ({ ...previous, narrationWav }));
    });
  }

  const missingVoices = missingCueVoices(part);
  const wavBlocker = part.audioMode === "cues" ? narrationWavBlocker(part) : undefined;

  return (
    <Stack spacing={2}>
      <Box sx={{
        display: "grid", gap: 2, alignItems: "start",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: originalAudioOnly ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)" },
      }}>
        <Box sx={{ position: { lg: "sticky" }, top: { lg: 16 }, minWidth: 0 }}>
          <Section title={`Part ${index + 1} recording`}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField fullWidth label="Part title" value={part.title} disabled={disabled}
                onChange={(event) => update((previous) => ({ ...previous, title: event.target.value }))} />
              <TextField fullWidth multiline label="Recording focus and timestamp notes" placeholder="For example, 1:23 — explain the menu that opens." value={part.focus} disabled={disabled}
                onChange={(event) => update((previous) => ({ ...previous, focus: event.target.value }))} />
            </Stack>
            <Typography variant="body2" color="text.secondary">{part.source.name} · {part.duration.toFixed(1)} s</Typography>
            <TextField select label="Audio for export" value={part.audioMode} disabled={disabled} sx={{ maxWidth: 340 }}
              onChange={(event) => {
                const mode = event.target.value;
                if (mode === "source" || mode === "take" || mode === "cues") {
                  update((previous) => ({ ...previous, audioMode: mode, output: undefined }));
                }
              }}>
              <MenuItem value="source">Original audio only</MenuItem>
              <MenuItem value="cues">Generated cue narration</MenuItem>
              <MenuItem value="take">Imported narration take</MenuItem>
            </TextField>
            <Box component="video" ref={videoRef} src={sourceUrl} controls muted={!originalAudioOnly} playsInline preload="metadata"
              aria-label={`Source recording for ${name}`} sx={{ width: "100%", maxHeight: 380, bgcolor: "common.black", borderRadius: 1 }}>
              {captionUrl && <track kind="captions" label="Captions" srcLang="en" src={captionUrl} />}
            </Box>
          </Section>
        </Box>

        {part.audioMode === "cues" && <Section title="Narration cues">
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button variant="contained" disabled={disabled} onClick={(event) => part.cues.length
              ? confirm("Replace cue draft?", "Drafting again replaces this part's cues and their generated voice clips.", draft, event.currentTarget)
              : draft()}>Draft cues</Button>
            <Button variant="outlined" onClick={addCue} disabled={disabled}>Add cue</Button>
            <Button disabled={disabled || !part.cues.some((cue) => cue.text.trim())} onClick={() => run("Copying cue script", async () => {
              await navigator.clipboard.writeText(part.cues.map((cue) => `[${cue.start}–${cue.end} s] ${cue.text.trim()}`).join("\n\n"));
            })}>Copy cue script</Button>
            <Button variant="outlined" disabled={disabled || project.voiceSelectionRequired || !missingVoices.length} onClick={() => generate(missingVoices)}>
              Generate missing voices
            </Button>
          </Stack>
          {part.cues.length > 0 && <Typography variant="body2" color="text.secondary">{audioCount} of {part.cues.length} cues voiced</Typography>}
          {part.cues.map((cue, cueIndex) => {
            const timingError = cueTimingError(cue, part);
            return (
              <Paper key={cue.id} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Typography component="h4" variant="subtitle2">Cue {cueIndex + 1}</Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField size="small" type="number" label="Start (seconds)" value={cue.start} disabled={disabled}
                      error={Boolean(timingError)} slotProps={{ htmlInput: { min: 0, max: part.duration, step: "any" } }}
                      onChange={(event) => changeCue(cue.id, (previous) => ({ ...previous, start: event.target.value }))} />
                    <TextField size="small" type="number" label="End (seconds)" value={cue.end} disabled={disabled}
                      error={Boolean(timingError)} slotProps={{ htmlInput: { min: 0, max: part.duration, step: "any" } }}
                      onChange={(event) => changeCue(cue.id, (previous) => ({ ...previous, end: event.target.value }))} />
                    <Button disabled={!sourceUrl || disabled} onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = Math.min(part.duration, Math.max(0, Number(cue.start) || 0));
                      videoRef.current?.scrollIntoView({ block: "nearest" });
                      videoRef.current?.focus({ preventScroll: true });
                    }}>Seek to cue</Button>
                  </Stack>
                  {timingError && <Typography variant="body2" color="error">{timingError}</Typography>}
                  <TextField fullWidth multiline minRows={2} label="What to say" value={cue.text} disabled={disabled}
                    onChange={(event) => changeCue(cue.id, (previous) => ({ ...previous, text: event.target.value, audio: undefined }))} />
                  {cue.audio && <AudioPlayer blob={cue.audio.blob} label={`Voice for cue ${cueIndex + 1}`} />}
                  <Stack direction="row" spacing={1}>
                    <Button disabled={disabled || project.voiceSelectionRequired || !cue.text.trim()} onClick={() => generate([cue])}>
                      {cue.audio ? "Regenerate voice" : "Generate voice"}
                    </Button>
                    <Button color="error" disabled={disabled} onClick={(event) => {
                      const remove = () => update((previous) => ({
                        ...previous,
                        cues: previous.cues.filter((item) => item.id !== cue.id),
                        output: previous.audioMode === "cues" ? undefined : previous.output,
                      }));
                      if (cue.text || cue.audio) confirm("Remove cue?", `Remove cue ${cueIndex + 1} and its voice from this recording?`, remove, event.currentTarget);
                      else remove();
                    }}>Remove cue</Button>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Section>}
        {part.audioMode === "take" && <Section title="Narration take">
          <UploadButton label={part.take ? "Replace full voice take" : "Import full voice take"}
            accept=".mp3,.m4a,.wav,.aac,.ogg,.opus,.webm,.flac,.mp4" disabled={disabled} onFiles={([file]) => importTake(file)} />
          {part.take && <>
            <Typography variant="body2" color="text.secondary">{part.take.name} · {part.take.duration.toFixed(1)} s audio / {part.duration.toFixed(1)} s video</Typography>
            <AudioPlayer blob={part.take.blob} label={`Imported take for ${name}`} />
            {part.duration - part.take.duration > 1 && (
              <Alert severity="info">Narration ends {(part.duration - part.take.duration).toFixed(1)} s before the video ends.</Alert>
            )}
          </>}
        </Section>}
      </Box>

      <LectureSlideDeckOutput part={part} project={project} index={index} disabled={disabled} update={update} run={run} />

      <LectureCaptions part={part} disabled={disabled} update={update} run={run} confirm={confirm} />

      <Section title="Export">
        {!originalAudioOnly && <>
          <FormControlLabel label="Mix recording audio with narration"
            control={<Switch checked={part.mixSourceAudio ?? false} disabled={disabled}
              onChange={(_, checked) => update((previous) => ({ ...previous, mixSourceAudio: checked, output: undefined }))} />} />
          <Divider />
          {part.audioMode === "cues" && !blocker && silentTail > 1 && (
            <Alert severity="info">Narration ends {silentTail.toFixed(1)} s before the video ends.</Alert>
          )}
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button variant="contained" onClick={render} disabled={disabled || Boolean(blocker)}>
              {part.output ? "Render narration again" : "Render narration video"}
            </Button>
            {part.audioMode === "cues" && !part.narrationWav && <Button variant="outlined" onClick={prepareNarrationWav}
              disabled={disabled || Boolean(wavBlocker)}>Prepare narration WAV</Button>}
          </Stack>
          <Typography variant="body2" color="text.secondary">Exports as MP4 when supported by this browser, or WebM otherwise.</Typography>
          {blocker && <Typography variant="body2" color="text.secondary">{blocker}</Typography>}
          {!blocker && wavBlocker && <Typography variant="body2" color="text.secondary">{wavBlocker}</Typography>}
          {progress !== null && <LinearProgress variant="determinate" value={progress} aria-label="Rendering video" />}
          {outputUrl && <>
            <Box component="video" src={outputUrl} controls playsInline preload="metadata" aria-label={`Narrated preview for ${name}`}
              sx={{ width: "100%", maxHeight: 380, bgcolor: "common.black", borderRadius: 1 }}>
              {captionUrl && <track kind="captions" label="Captions" srcLang="en" src={captionUrl} />}
            </Box>
          </>}
        </>}
        <Button href="#lecture-downloads" sx={{ alignSelf: "flex-start" }}>Open downloads</Button>
        <TextField fullWidth label="Student watch link" placeholder="https://" value={part.watchUrl} disabled={disabled}
          helperText="Paste the link after uploading the exported video to your hosting service."
          onChange={(event) => update((previous) => ({ ...previous, watchUrl: event.target.value }))} />
      </Section>
    </Stack>
  );
}
