"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, CircularProgress, List, ListItemButton, ListItemText, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { draftAnnouncementAction } from "@/app/actions";
import { extractDeckSourceFileAction } from "@/app/actions/deck-source";
import { transcribeLiveAudioAction } from "@/app/actions/live-class";
import { listElevenVoicesAction } from "@/app/actions/media-voice";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import { checkWireBudget } from "@/lib/upload-budget";
import { ModalShell } from "../ui/ModalShell";
import LecturePartEditor, { type RunLectureTask } from "./LecturePartEditor";
import LectureScreenCapture from "./LectureScreenCapture";
import LectureVoiceManager from "./LectureVoiceManager";
import { Section, UploadButton } from "./lectureControls";
import { partFromVideo, readBase64 } from "./lectureMedia";
import { assignCues, changePartCue, materialContext, missingCueVoices, partName, removeProjectVoiceReference, type LecturePart, type LectureProject } from "./lectureProject";
import { draftPartCues, synthesizeCue } from "./lectureWorkflow";
import { useLectureProject } from "./useLectureProject";

type Confirmation = { title: string; message: string; action: () => void };
type Voice = { voiceId: string; name: string; category: string };

function watchLink(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? value.trim() : "";
  } catch {
    return "";
  }
}

export default function LectureVideos({ active = true }: { active?: boolean }) {
  const { user, loading, accessDecision } = useSupabase();
  if (loading) return <Typography role="status">Opening narration and caption generation…</Typography>;
  if (!user) return <Alert severity="info">Sign in to open your saved video project.</Alert>;
  return <LectureWorkspace key={user.id} account={user.id} active={active} canManageVoices={isOwnerDecision(accessDecision)} />;
}

function LectureWorkspace({ account, active, canManageVoices }: { account: string; active: boolean; canManageVoices: boolean }) {
  const { project, loading, loadError, saveStatus, update, updatePart, retrySave } = useLectureProject(account);
  const [busy, setBusy] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  const voiceSelect = useRef<HTMLDivElement>(null);
  const work = useRef<AbortController | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => () => work.current?.abort(), []);
  useLayoutEffect(() => {
    if (!active) workspace.current?.querySelectorAll<HTMLMediaElement>("video, audio").forEach((media) => media.pause());
  }, [active]);
  const index = project.parts.findIndex((part) => part.id === project.selectedId);
  const selected = project.parts[index];
  const disabled = Boolean(busy) || capturing;

  const run: RunLectureTask = (label, task) => {
    if (work.current) return;
    const controller = new AbortController();
    work.current = controller;
    setBusy(label);
    setError("");
    setNotice("");
    void (async () => {
      try {
        await task(controller.signal);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The video task failed. Try again.");
      } finally {
        work.current = null;
        if (!controller.signal.aborted) setBusy("");
      }
    })();
  };

  function confirm(title: string, message: string, action: () => void, trigger: HTMLElement | null) {
    confirmationTrigger.current = trigger;
    setConfirmation({ title, message, action });
  }

  function field<Key extends keyof LectureProject>(key: Key, value: LectureProject[Key]) {
    update((previous) => ({ ...previous, [key]: value }));
  }

  function addVideos(files: File[], mixSourceAudio = false) {
    run("Reading recordings", async (signal) => {
      const accepted: LecturePart[] = [];
      const failures: string[] = [];
      for (const file of files) {
        signal.throwIfAborted();
        try {
          const part = await partFromVideo(file);
          accepted.push(mixSourceAudio ? { ...part, mixSourceAudio: true } : part);
        } catch (cause) {
          failures.push(`${file.name}: ${cause instanceof Error ? cause.message : "Could not read the file."}`);
        }
      }
      signal.throwIfAborted();
      if (accepted.length) {
        update((previous) => ({ ...previous, parts: [...previous.parts, ...accepted], selectedId: accepted[0].id }));
      }
      if (failures.length) throw new Error(failures.join("\n"));
    });
  }

  function addMaterials(files: File[]) {
    run("Reading reference files", async (signal) => {
      const failures: string[] = [];
      for (const file of files) {
        signal.throwIfAborted();
        try {
          const size = checkWireBudget(Math.ceil(file.size / 3) * 4, "This reference file");
          if (!size.ok) throw new Error(size.error ?? "This reference file is too large.");
          const base64 = await readBase64(file);
          signal.throwIfAborted();
          const result = await extractDeckSourceFileAction(file.name, base64);
          signal.throwIfAborted();
          if ("error" in result) throw new Error(result.error);
          update((previous) => ({
            ...previous,
            materialFiles: [...previous.materialFiles, {
              id: crypto.randomUUID(), name: file.name, text: result.materials, truncated: result.receipt.truncated,
            }],
          }));
        } catch (cause) {
          failures.push(`${file.name}: ${cause instanceof Error ? cause.message : "Could not read the file."}`);
        }
      }
      if (failures.length) throw new Error(failures.join("\n"));
    });
  }

  function addSample(file: File, trigger: HTMLInputElement) {
    const transcribe = () => run(`Reading ${file.name}`, async (signal) => {
      const size = checkWireBudget(Math.ceil(file.size / 3) * 4, "This speaking sample");
      if (!size.ok) throw new Error(size.error ?? "This speaking sample is too large.");
      const base64 = await readBase64(file);
      signal.throwIfAborted();
      const result = await transcribeLiveAudioAction(base64, { provider: "gemini" });
      signal.throwIfAborted();
      if ("error" in result) throw new Error(result.error);
      if (!result.text.trim()) throw new Error("No speech was found in this sample. Choose another clip or paste a transcript.");
      field("sample", result.text);
    });
    if (project.sample.trim()) confirm("Replace speaking sample?", "The new transcript will replace the saved speaking sample.", transcribe, trigger);
    else transcribe();
  }

  function loadVoices() {
    run("Loading ElevenLabs voices", async (signal) => {
      const result = await listElevenVoicesAction();
      signal.throwIfAborted();
      if ("error" in result) throw new Error(result.error);
      setVoices(result.voices);
    });
  }

  function chooseVoice(id: string) {
    const selected = voices?.find((voice) => voice.voiceId === id);
    if (id && !selected) return;
    selectProjectVoice(selected ? { id: selected.voiceId, name: selected.name } : undefined);
  }

  function selectProjectVoice(voice: LectureProject["voice"]) {
    if (!project.voiceSelectionRequired && voice?.id === project.voice?.id) return;
    const change = () => update((previous) => ({
      ...previous,
      voice,
      voiceSelectionRequired: false,
      parts: previous.voiceSelectionRequired ? previous.parts : previous.parts.map((part) => part.cues.some((cue) => cue.audio)
        ? assignCues(part, part.cues.map((cue) => ({ ...cue, audio: undefined }))) : part),
    }));
    if (!project.voiceSelectionRequired && project.parts.some((part) => part.cues.some((cue) => cue.audio))) {
      confirm("Change the narration voice?", "Changing the voice clears the generated cue audio so you can regenerate it with this voice.", change,
        voiceSelect.current?.querySelector<HTMLElement>('[role="combobox"]') ??
        workspace.current?.querySelector<HTMLElement>('#manage-elevenlabs-voices') ?? null);
    } else change();
  }

  function voiceSaved({ id, name, category, available = true }: { id: string; name: string; category: string; available?: boolean }) {
    setVoices((previous) => previous && [
      ...previous.filter((voice) => voice.voiceId !== id),
      ...(available ? [{ voiceId: id, name, category }] : []),
    ]);
    if (project.voice?.id === id && project.voice.name !== name) {
      update((previous) => ({
        ...previous,
        voice: previous.voice?.id === id ? { id, name } : previous.voice,
      }));
    }
  }

  function voiceDeleted(id: string, wasDefault: boolean) {
    setVoices((previous) => previous?.filter((voice) => voice.voiceId !== id) ?? null);
    if (project.voice?.id === id || (!project.voice && wasDefault)) {
      update((previous) => removeProjectVoiceReference(previous, id, wasDefault));
    }
  }

  function draftMissingCues() {
    run("Drafting cues for remaining parts", async (signal) => {
      for (const [partIndex, part] of project.parts.entries()) {
        if (part.audioMode !== "cues" || part.cues.length) continue;
        const cues = await draftPartCues(part, partIndex, project, signal);
        updatePart(part.id, (previous) => assignCues(previous, cues));
      }
    });
  }

  function generateMissingVoices() {
    if (project.voiceSelectionRequired) return;
    run("Generating missing cue voices", async (signal) => {
      for (const part of project.parts) {
        if (part.audioMode !== "cues") continue;
        for (const cue of missingCueVoices(part)) {
          const audio = await synthesizeCue(cue, project.voice?.id, signal);
          updatePart(part.id, (previous) => changePartCue(previous, cue.id, (item) => ({ ...item, audio })));
        }
      }
    });
  }

  function movePart(direction: -1 | 1) {
    update((previous) => {
      const from = previous.parts.findIndex((part) => part.id === previous.selectedId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= previous.parts.length) return previous;
      const parts = [...previous.parts];
      [parts[from], parts[to]] = [parts[to], parts[from]];
      return { ...previous, parts };
    });
  }

  function removePart(trigger: HTMLElement) {
    if (!selected) return;
    confirm("Remove this recording?", `Remove ${partName(selected, index)}, including its recording, cues, audio, and preview?`, () => {
      update((previous) => {
        const parts = previous.parts.filter((part) => part.id !== selected.id);
        return { ...previous, parts, selectedId: parts[Math.min(index, parts.length - 1)]?.id ?? null };
      });
    }, trigger);
  }

  function draftAnnouncement(trigger: HTMLElement) {
    const draft = () => run("Drafting the announcement", async (signal) => {
      const instruction = [
        `Announce the lecture video series ${project.title.trim() || "for this lecture"}. Briefly tell students the focus and why to watch each part in order.`,
        project.parts.map((part, i) => [
          `Part ${i + 1}: ${partName(part, i)}`,
          part.focus,
          part.cues.map((cue) => cue.text.trim()).filter(Boolean).join(" ").slice(0, 1800),
        ].filter(Boolean).join("\n")).join("\n\n"),
        materialContext(project) && `Shared lecture material for factual context:\n${materialContext(project).slice(0, 10000)}`,
        "The app adds the list of watch links separately. Do not include URLs, placeholders, deadlines, or unsupported claims.",
      ].filter(Boolean).join("\n\n");
      const result = await draftAnnouncementAction(instruction, "gemini");
      signal.throwIfAborted();
      if ("error" in result) throw new Error(result.error);
      if (!result.message.trim()) throw new Error("The draft was empty. Try again or write the announcement below.");
      update((previous) => ({ ...previous, announcementTitle: result.title, announcementBody: result.message }));
    });
    if (project.announcementTitle.trim() || project.announcementBody.trim()) {
      confirm("Replace announcement draft?", "This will replace the current subject and message.", draft, trigger);
    } else draft();
  }

  function copyAnnouncement() {
    run("Copying announcement", async (signal) => {
      const links = project.parts.map((part, i) => `${i + 1}. ${partName(part, i)} — ${watchLink(part.watchUrl) || "[Add video link]"}`);
      const resource = watchLink(project.resourceUrl);
      const starter = watchLink(project.starterUrl);
      await navigator.clipboard.writeText([
        project.announcementTitle.trim(), project.announcementBody.trim(),
        links.length ? `Watch in this order:\n${links.join("\n")}` : "",
        resource && `Module or lecture resource: ${resource}`,
        starter && `GitHub starter: ${starter}`,
      ].filter(Boolean).join("\n\n"));
      signal.throwIfAborted();
      setNotice("Announcement copied.");
    });
  }

  if (loading) return <Typography role="status">Opening your saved project…</Typography>;
  if (loadError) return <Alert severity="error">{loadError}</Alert>;

  return (
    <Stack ref={workspace} spacing={3} sx={{ p: { xs: 1, md: 2 }, minWidth: 0 }}>
      <Box>
        <Typography component="h2" variant="h5">Narration/Caption Generation</Typography>
        <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 0.5 }}>
          {saveStatus === "saving" ? "Saving project on this device…" : saveStatus === "saved" ? "Project saved on this device" : "Project changes are unsaved"}
        </Typography>
      </Box>
      {saveStatus === "failed" && (
        <Alert severity="error" action={<Button color="inherit" onClick={retrySave}>Retry save</Button>}>
          Could not save the project on this device. Keep the page open until it saves.
        </Alert>
      )}
      {saveStatus === "conflict" && (
        <Alert severity="error" action={<Button color="inherit" disabled={disabled} onClick={(event) => confirm("Load the saved project?", "Reloading will discard the unsaved changes in this tab.", () => window.location.reload(), event.currentTarget)}>Reload</Button>}>
          Another tab saved changes to the project. Your edits in this tab are unsaved.
        </Alert>
      )}
      {busy && <Alert severity="info" role="status" icon={<CircularProgress size={20} />} sx={{ position: "sticky", top: 0, zIndex: 1 }}>{busy}…</Alert>}
      {error && <Alert severity="error" onClose={() => setError("")} sx={{ whiteSpace: "pre-line" }}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}

      <Section title="Video context">
        <TextField label="Project title" value={project.title} disabled={disabled} onChange={(event) => field("title", event.target.value)} />
        <TextField label="What should viewers learn or do?" value={project.goal ?? ""} disabled={disabled}
          onChange={(event) => field("goal", event.target.value)} />
        <TextField fullWidth multiline minRows={3} label="Context and notes" value={project.materials} disabled={disabled}
          placeholder="Describe the audience, workflow, or details to cover."
          onChange={(event) => field("materials", event.target.value)} />
        <UploadButton label="Add reference files" accept=".pptx,.pdf,.docx,.txt,.md,.csv,.html" multiple disabled={disabled} onFiles={addMaterials} />
        {project.materialFiles.map((file) => (
          <Stack key={file.id} direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="body2">{file.name}{file.truncated ? " (long file, text shortened)" : ""}</Typography>
            <Button size="small" disabled={disabled} aria-label={`Remove ${file.name}`} onClick={(event) => confirm(
              "Remove reference file?", `Remove the extracted text from ${file.name}?`,
              () => update((previous) => ({ ...previous, materialFiles: previous.materialFiles.filter((material) => material.id !== file.id) })),
              event.currentTarget,
            )}>Remove</Button>
          </Stack>
        ))}
        <TextField fullWidth multiline minRows={2} label="Speaking guidance" placeholder="How should the narration sound?"
          value={project.guidance} disabled={disabled} onChange={(event) => field("guidance", event.target.value)} />
        <TextField fullWidth multiline minRows={2} label="Speaking sample transcript" value={project.sample} disabled={disabled}
          placeholder="Paste a transcript that shows your usual speaking style."
          onChange={(event) => field("sample", event.target.value)} />
        <UploadButton label="Transcribe a short WAV sample" accept=".wav,audio/wav,audio/x-wav" disabled={disabled}
          onFiles={([file], input) => addSample(file, input)} />
        {voices ? (
          <TextField ref={voiceSelect} select label="Narration voice" value={project.voiceSelectionRequired ? "__choose__" : project.voice?.id ?? ""} disabled={disabled}
            onChange={(event) => chooseVoice(event.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
            {project.voiceSelectionRequired && <MenuItem disabled value="__choose__">Choose a replacement voice</MenuItem>}
            <MenuItem value="">Account default</MenuItem>
            {project.voice && !voices.some((voice) => voice.voiceId === project.voice?.id) && (
              <MenuItem value={project.voice.id}>{project.voice.name} (unavailable)</MenuItem>
            )}
            {voices.map((voice) => <MenuItem key={voice.voiceId} value={voice.voiceId}>{voice.name}{voice.category === "cloned" ? " (cloned)" : ""}</MenuItem>)}
          </TextField>
        ) : <Button variant="outlined" onClick={loadVoices} disabled={disabled} sx={{ alignSelf: "flex-start" }}>
          Choose ElevenLabs voice{project.voice ? ` (${project.voice.name})` : ""}
        </Button>}
        {canManageVoices && <LectureVoiceManager active={active} disabled={disabled || Boolean(confirmation)} selectedVoice={project.voice}
          selectionRequired={project.voiceSelectionRequired}
          onSelectVoice={selectProjectVoice} onVoiceSaved={voiceSaved} onVoiceDeleted={voiceDeleted} />}
        {project.voiceSelectionRequired && <Alert severity="info">
          Choose a replacement voice before generating more narration. Your existing audio and exports are available.
        </Alert>}
      </Section>

      <Section title="Recordings">
        <LectureScreenCapture active={active} disabled={Boolean(busy) || Boolean(confirmation)}
          onCapturingChange={setCapturing} onCaptured={(file, hasSystemAudio) => addVideos([file], hasSystemAudio)} />
        <UploadButton label="Add recordings" accept=".mp4,.webm,.mov,.m4v,.ogg,.ogv" multiple disabled={disabled} onFiles={(files) => addVideos(files)} />
        {project.parts.length > 0 && <>
          <List disablePadding aria-label="Recordings">
            {project.parts.map((part, partIndex) => (
              <ListItemButton key={part.id} selected={part.id === project.selectedId} disabled={disabled}
                aria-current={part.id === project.selectedId ? "true" : undefined} onClick={() => field("selectedId", part.id)}>
                <ListItemText primary={`${partIndex + 1}. ${partName(part, partIndex)}`}
                  secondary={`${part.duration.toFixed(1)} s · ${part.output ? "Rendered" : part.cues.length ? `${part.cues.length} cues` : "Recording added"}`} />
              </ListItemButton>
            ))}
          </List>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button disabled={disabled || index < 1} onClick={() => movePart(-1)}>Move part up</Button>
            <Button disabled={disabled || index < 0 || index >= project.parts.length - 1} onClick={() => movePart(1)}>Move part down</Button>
            <Button color="error" disabled={disabled || !selected} onClick={(event) => removePart(event.currentTarget)}>Remove part</Button>
          </Stack>
          {project.parts.length > 1 && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button variant="outlined" disabled={disabled || !project.parts.some((part) => part.audioMode === "cues" && !part.cues.length)} onClick={draftMissingCues}>
              Draft cues for remaining parts
            </Button>
            <Button variant="outlined" disabled={disabled || project.voiceSelectionRequired || !project.parts.some((part) => part.audioMode === "cues" && missingCueVoices(part).length)} onClick={generateMissingVoices}>
              Generate missing voices across parts
            </Button>
          </Stack>}
        </>}
      </Section>

      {selected && <LecturePartEditor key={selected.id} part={selected} project={project} index={index} disabled={disabled}
        update={(change) => updatePart(selected.id, change)} run={run} confirm={confirm} />}

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<span aria-hidden="true">+</span>} id="video-announcement-header" aria-controls="video-announcement">
          <Typography component="span">Student announcement (optional)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Button variant="outlined" disabled={disabled || !project.parts.length} onClick={(event) => draftAnnouncement(event.currentTarget)} sx={{ alignSelf: "flex-start" }}>Draft announcement</Button>
            <TextField label="Announcement subject" value={project.announcementTitle} disabled={disabled}
              onChange={(event) => field("announcementTitle", event.target.value)} />
            <TextField fullWidth multiline minRows={4} label="Announcement message" value={project.announcementBody} disabled={disabled}
              onChange={(event) => field("announcementBody", event.target.value)} />
            <TextField fullWidth label="Module or lecture resource URL" type="url" value={project.resourceUrl} disabled={disabled}
              error={Boolean(project.resourceUrl.trim() && !watchLink(project.resourceUrl))}
              onChange={(event) => field("resourceUrl", event.target.value)} />
            <TextField fullWidth label="GitHub starter URL" type="url" value={project.starterUrl} disabled={disabled}
              error={Boolean(project.starterUrl.trim() && !watchLink(project.starterUrl))}
              onChange={(event) => field("starterUrl", event.target.value)} />
            {!!project.parts.length && <Typography variant="body2" color="text.secondary">
              The copied announcement includes the videos in order. {project.parts.filter((part) => watchLink(part.watchUrl)).length} of {project.parts.length} watch links added.
            </Typography>}
            <Button variant="contained" disabled={disabled || !project.announcementBody.trim()} onClick={copyAnnouncement} sx={{ alignSelf: "flex-start" }}>Copy announcement</Button>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {confirmation && (
        <ModalShell label={confirmation.title} onDismiss={() => setConfirmation(null)}
          restoreFocusRef={confirmationTrigger} contentStyle={{ maxWidth: 480 }}>
          <Stack spacing={2} sx={{ p: 3 }}>
            <Typography component="h3" variant="h6">{confirmation.title}</Typography>
            <Typography>{confirmation.message}</Typography>
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button onClick={() => setConfirmation(null)}>Cancel</Button>
              <Button variant="contained" onClick={() => {
                setConfirmation(null);
                confirmation.action();
              }}>Confirm</Button>
            </Stack>
          </Stack>
        </ModalShell>
      )}
    </Stack>
  );
}
