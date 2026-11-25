"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography,
} from "@mui/material";
import {
  auditionElevenVoiceAction, cloneElevenVoiceAction, deleteElevenVoiceAction, designElevenVoiceAction,
  listElevenVoiceLibraryAction, saveDesignedElevenVoiceAction, setDefaultElevenVoiceAction, updateElevenVoiceAction,
  type ElevenManagedVoice as Voice,
} from "@/app/actions/eleven-voice-library";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { ModalShell } from "../ui/ModalShell";
import { AudioPlayer, UploadButton } from "./lectureControls";

type Library = { voices: Voice[]; defaultVoiceId: string | null; hasAccountDefault: boolean };
type VoiceRef = { id: string; name: string };
type SavedVoice = VoiceRef & { category: string; contentChanged?: boolean; available?: boolean };
type Preview = { id: string; audio: Blob; duration: number };
type VoiceForm = { name: string; description: string };
type VoiceLabel = { id: string; key: string; value: string };
type SampleForm = { files: File[]; consent: boolean; labels: VoiceLabel[]; labelsEdited: boolean };
type SampleEditor = ({ kind: "clone" } | { kind: "edit"; voice: Voice }) & VoiceForm & SampleForm;
type Editor =
  | SampleEditor
  | ({ kind: "design"; text: string; previews: Preview[]; selectedPreviewId: string } & VoiceForm)
  | { kind: "delete"; voice: Voice }
  | { kind: "default"; voice: Voice | null };

type Props = {
  active?: boolean;
  disabled?: boolean;
  selectedVoice?: VoiceRef;
  selectionRequired?: boolean;
  onSelectVoice: (voice: VoiceRef | undefined) => void;
  onVoiceDeleted: (id: string, wasDefault: boolean) => void;
  onVoiceSaved: (voice: SavedVoice) => void;
};

const SAMPLE_COUNT = 5;
const SAMPLE_BYTES = UPLOAD_WIRE_BUDGET_BYTES - 16 * 1024;
const SAMPLE_EXTENSIONS = ".mp3,.wav,.m4a,.aac,.ogg,.opus,.webm,.flac";
const SAMPLE_FILE = /\.(mp3|wav|m4a|aac|ogg|opus|webm|flac)$/i;
const NAME_LIMIT = 100;
const DESCRIPTION_LIMIT = 1000;
const DESIGN_MIN_DESCRIPTION = 20;
const DESIGN_MIN_TEXT = 100;
const LABEL_LIMIT = 16;
const LABEL_KEY_LIMIT = 40;
const LABEL_VALUE_LIMIT = 120;

function labelObject(labels: readonly VoiceLabel[]): Record<string, string> {
  return Object.fromEntries(labels.map(({ key, value }) => [key.trim(), value.trim()]));
}

function labelProblem(labels: readonly VoiceLabel[]): string {
  if (labels.some(({ key, value }) => !key.trim() || !value.trim())) return "Fill in each label name and value, or remove the empty label.";
  if (Object.keys(labelObject(labels)).length !== labels.length) return "Use a different name for each label.";
  return "";
}

function samplePayload(draft: SampleEditor): FormData {
  const form = new FormData();
  form.append("consent", String(draft.consent));
  for (const file of draft.files) form.append("files", file);
  if (draft.labelsEdited) form.append("labels", JSON.stringify(labelObject(draft.labels)));
  return form;
}

function audioBlob(base64: string, mimeType: string): Blob {
  return new Blob([Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))], { type: mimeType });
}

function dialogTitle(editor: Editor): string {
  switch (editor.kind) {
    case "clone": return "Clone a voice from recordings";
    case "design": return "Design a voice";
    case "edit": return "Edit voice details";
    case "delete": return "Delete this ElevenLabs voice?";
    case "default": return editor.voice ? "Change the account default voice?" : "Clear the account default voice?";
  }
}

export default function LectureVoiceManager({
  active = true, disabled = false, selectedVoice, selectionRequired = false, onSelectVoice, onVoiceDeleted, onVoiceSaved,
}: Props) {
  const [library, setLibrary] = useState<Library>();
  const [opened, setOpened] = useState(false);
  const [browsedId, setBrowsedId] = useState("");
  const [search, setSearch] = useState("");
  const [audition, setAudition] = useState<{ id: string; audio: Blob }>();
  const [editor, setEditor] = useState<Editor>();
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const operation = useRef<object | undefined>(undefined);
  const launchButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const browseButton = useRef<HTMLButtonElement>(null);
  const fallbackFocusRefs = useMemo(() => [browseButton], []);
  useLayoutEffect(() => () => { operation.current = undefined; }, []);

  const voice = library?.voices.find(({ voiceId }) => voiceId === browsedId);
  const defaultVoice = library?.voices.find(({ voiceId }) => voiceId === library.defaultVoiceId);
  const query = search.trim().toLocaleLowerCase();
  const matches = library?.voices.filter((item) => [item.name, item.description, item.category, ...Object.entries(item.labels).flat()]
    .some((field) => field.toLocaleLowerCase().includes(query))) ?? [];
  const browseOptions = voice && !matches.includes(voice) ? [voice, ...matches] : matches;
  const locked = disabled || !active || Boolean(working);
  const invalidLabels = editor?.kind === "clone" || editor?.kind === "edit" ? labelProblem(editor.labels) : "";

  function run(label: string, task: (current: () => boolean) => Promise<void>) {
    if (operation.current || disabled || !active) return;
    const ticket = {};
    operation.current = ticket;
    const current = () => operation.current === ticket;
    setWorking(label);
    setError("");
    setNotice("");
    setWarning("");
    void (async () => {
      try {
        await task(current);
      } catch (cause) {
        if (current()) setError(cause instanceof Error ? cause.message : "The voice request could not be completed.");
      } finally {
        if (current()) {
          operation.current = undefined;
          setWorking("");
        }
      }
    })();
  }

  function load() {
    run("Loading voices", async (current) => {
      const response = await listElevenVoiceLibraryAction();
      if (!current()) return;
      if ("error" in response) throw new Error(response.error);
      setLibrary(response);
      setBrowsedId((previous) => [previous, selectedVoice?.id, response.defaultVoiceId]
        .find((id) => response.voices.some((item) => item.voiceId === id)) ?? response.voices[0]?.voiceId ?? "");
    });
  }

  function open(next: Editor, trigger: HTMLElement) {
    restoreFocus.current = trigger;
    setError("");
    setNotice("");
    setWarning("");
    setEditor(next);
  }

  function close() {
    if (operation.current) return;
    setEditor(undefined);
    setError("");
  }

  function closeLibrary() {
    if (operation.current || editor) return;
    setOpened(false);
    setAudition(undefined);
    setSearch("");
    setError("");
    setNotice("");
    setWarning("");
  }

  function chooseProjectVoice(item?: Voice) {
    closeLibrary();
    onSelectVoice(item ? { id: item.voiceId, name: item.name } : undefined);
  }

  function saveInList(item: Voice, contentChanged = false) {
    setLibrary((previous) => previous && {
      ...previous,
      voices: previous.voices.some((entry) => entry.voiceId === item.voiceId)
        ? previous.voices.map((entry) => entry.voiceId === item.voiceId ? item : entry)
        : [...previous.voices, item],
    });
    setBrowsedId(item.voiceId);
    if (contentChanged) setAudition(undefined);
    onVoiceSaved({
      id: item.voiceId, name: item.name, category: item.category, contentChanged, available: !item.verificationRequired,
    });
    setEditor(undefined);
    setNotice(item.verificationRequired
      ? "ElevenLabs requires verification before this voice can be used."
      : `${item.name} saved in ElevenLabs.`);
  }

  function auditionVoice(item: Voice) {
    run("Generating an audition", async (current) => {
      const response = await auditionElevenVoiceAction(item.voiceId);
      if (!current()) return;
      if ("error" in response) throw new Error(response.error);
      setAudition({ id: item.voiceId, audio: audioBlob(response.base64, response.mimeType) });
    });
  }

  function addFiles(draft: SampleEditor, added: File[]) {
    const files = [...draft.files, ...added];
    if (files.length > SAMPLE_COUNT) {
      setError(`Choose up to ${SAMPLE_COUNT} recordings.`);
      return;
    }
    if (added.some((file) => !file.size || !SAMPLE_FILE.test(file.name))) {
      setError("Choose non-empty audio recordings in a supported format.");
      return;
    }
    if (files.reduce((bytes, file) => bytes + file.size, 0) > SAMPLE_BYTES) {
      setError("The combined recordings are too large. Trim them or choose smaller files.");
      return;
    }
    setError("");
    setEditor({ ...draft, files, consent: false });
  }

  function clone(draft: SampleEditor) {
    run("Creating the cloned voice", async (current) => {
      const form = samplePayload(draft);
      form.append("name", draft.name.trim());
      form.append("description", draft.description.trim());
      const response = await cloneElevenVoiceAction(form);
      if (!current()) return;
      if ("error" in response) throw new Error(response.error);
      saveInList({
        voiceId: response.voiceId, name: draft.name.trim(), description: draft.description.trim(),
        category: "cloned", manageable: true, verificationRequired: response.verificationRequired, labels: labelObject(draft.labels),
      });
    });
  }

  function design(draft: Extract<Editor, { kind: "design" }>) {
    run("Designing voice previews", async (current) => {
      const response = await designElevenVoiceAction(draft.description.trim(), draft.text.trim() || undefined);
      if (!current()) return;
      if ("error" in response) throw new Error(response.error);
      const previews = response.previews.map((preview) => ({
        id: preview.generatedVoiceId, audio: audioBlob(preview.base64, preview.mimeType), duration: preview.durationSec,
      }));
      setEditor({ ...draft, previews, selectedPreviewId: "" });
    });
  }

  function saveDesign(draft: Extract<Editor, { kind: "design" }>) {
    run("Saving the designed voice", async (current) => {
      const response = await saveDesignedElevenVoiceAction(draft.selectedPreviewId, draft.name.trim(), draft.description.trim());
      if (!current()) return;
      if ("error" in response) throw new Error(response.error);
      saveInList({
        voiceId: response.voiceId, name: draft.name.trim(), description: draft.description.trim(),
        category: "generated", manageable: true, verificationRequired: false, labels: {},
      });
    });
  }

  function edit(draft: SampleEditor & { kind: "edit"; voice: Voice }) {
    run("Saving voice details", async (current) => {
      const response = await updateElevenVoiceAction(draft.voice.voiceId, draft.name.trim(), draft.description.trim(), samplePayload(draft));
      if (!current()) return;
      if ("error" in response) throw new Error(response.error);
      saveInList({
        ...draft.voice, name: draft.name.trim(), description: draft.description.trim(), labels: labelObject(draft.labels),
      }, draft.files.length > 0);
    });
  }

  function remove(item: Voice) {
    const wasDefault = library?.defaultVoiceId === item.voiceId;
    run("Deleting the voice", async (current) => {
      const response = await deleteElevenVoiceAction(item.voiceId);
      if (!current()) return;
      if ("error" in response) throw new Error(response.error);
      setLibrary((previous) => previous && {
        ...previous,
        voices: previous.voices.filter(({ voiceId }) => voiceId !== item.voiceId),
      });
      setBrowsedId(library?.voices.find(({ voiceId }) => voiceId !== item.voiceId)?.voiceId ?? "");
      setAudition((previous) => previous?.id === item.voiceId ? undefined : previous);
      onVoiceDeleted(item.voiceId, wasDefault);
      setEditor(undefined);
      if (response.warning) setWarning(response.warning);
      else setNotice(`${item.name} deleted from ElevenLabs.`);
    });
  }

  function changeDefault(item: Voice | null) {
    const id = item?.voiceId ?? null;
    run("Saving the account default", async (current) => {
      const response = await setDefaultElevenVoiceAction(id);
      if (!current()) return;
      if ("error" in response) throw new Error(response.error);
      setLibrary((previous) => previous && { ...previous, defaultVoiceId: id, hasAccountDefault: id !== null });
      setEditor(undefined);
      setNotice(item ? `${item.name} is now the account default.` : "Account default cleared.");
      if (!id) {
        const refreshed = await listElevenVoiceLibraryAction();
        if (current() && "voices" in refreshed) setLibrary(refreshed);
      }
    });
  }

  return (
    <Stack spacing={1.5}>
      <Button id="manage-elevenlabs-voices" ref={launchButton} variant="outlined" disabled={locked} onClick={() => {
        setOpened(true);
        if (!library) load();
      }} sx={{ alignSelf: "flex-start" }}>Manage ElevenLabs voices</Button>
      {active && opened && (
        <ModalShell label="ElevenLabs voices" onDismiss={closeLibrary} restoreFocusRef={launchButton}
          contentStyle={{ width: "min(680px, calc(100vw - 32px))" }}>
          <Stack spacing={2} sx={{ p: 2 }}>
            <Typography component="h3" variant="h6">ElevenLabs voices</Typography>
            <Typography variant="body2">
              Project voice: {selectionRequired ? "Choose a replacement voice" : selectedVoice?.name ?? "Account default"}
              {library && selectedVoice && !library.voices.some(({ voiceId }) => voiceId === selectedVoice.id) ? " (unavailable)" : ""}
            </Typography>
            {!library && !working && <Button variant="outlined" disabled={locked} onClick={load}
              sx={{ alignSelf: "flex-start" }}>Retry loading voices</Button>}
            {library && <>
              <Typography variant="body2" color="text.secondary">
                Account default: {defaultVoice?.name ?? (library.hasAccountDefault ? "Unavailable" : "Workspace default")}
              </Typography>
              {library.voices.length > 0 && (
                <TextField size="small" label="Search voices" value={search} disabled={locked}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  onChange={(event) => setSearch(event.target.value)} />
              )}
              {query && !matches.length && <Typography variant="body2" role="status">No voices match this search.</Typography>}
              {library.voices.length > 0 && (
                <TextField select label="Browse ElevenLabs voices" value={voice?.voiceId ?? ""} disabled={locked}
                  onChange={(event) => setBrowsedId(event.target.value)} fullWidth>
                  {browseOptions.map((item) => (
                    <MenuItem key={item.voiceId} value={item.voiceId}>
                      {item.name}{item.category ? ` (${item.category})` : ""}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {voice?.description && <Typography variant="body2">{voice.description}</Typography>}
              {voice?.verificationRequired && <Alert severity="warning">Verify this voice in ElevenLabs before using it.</Alert>}
              {voice && (
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Button variant="outlined" disabled={locked || voice.verificationRequired} onClick={() => auditionVoice(voice)}>Audition</Button>
                  <Button variant="contained" disabled={locked || voice.verificationRequired || selectedVoice?.id === voice.voiceId}
                    onClick={() => chooseProjectVoice(voice)}>Use in project</Button>
                  <Button disabled={locked || voice.verificationRequired || (library.hasAccountDefault && library.defaultVoiceId === voice.voiceId)}
                    onClick={(event) => open({ kind: "default", voice }, event.currentTarget)}>Set as account default</Button>
                  {voice.manageable && <>
                    <Button disabled={locked} onClick={(event) => open({
                      kind: "edit", voice, name: voice.name, description: voice.description, files: [], consent: false,
                      labels: Object.entries(voice.labels ?? {}).map(([key, value]) => ({ id: crypto.randomUUID(), key, value })),
                      labelsEdited: false,
                    }, event.currentTarget)}>Edit voice</Button>
                    <Button disabled={locked || library.defaultVoiceId === voice.voiceId} color="error"
                      onClick={(event) => open({ kind: "delete", voice }, event.currentTarget)}>Delete voice</Button>
                  </>}
                </Stack>
              )}
              {!editor && voice && audition?.id === voice.voiceId && <AudioPlayer blob={audition.audio} label={`Audition of ${voice.name}`} />}
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button variant="outlined" disabled={locked} onClick={(event) => open({
                  kind: "clone", name: "", description: "", files: [], consent: false, labels: [], labelsEdited: false,
                }, event.currentTarget)}>Clone voice</Button>
                <Button variant="outlined" disabled={locked} onClick={(event) => open({
                  kind: "design", name: "", description: "", text: "", previews: [], selectedPreviewId: "",
                }, event.currentTarget)}>Design voice</Button>
                <Button disabled={locked} onClick={() => chooseProjectVoice()}>Follow account default</Button>
                {library.hasAccountDefault && <Button disabled={locked} onClick={(event) => open({
                  kind: "default", voice: null,
                }, event.currentTarget)}>Clear account default</Button>}
                <Button ref={browseButton} disabled={locked} onClick={load}>Refresh voices</Button>
              </Stack>
            </>}
            {!editor && working && <Typography variant="body2" role="status">{working}…</Typography>}
            {!editor && error && <Alert severity="error">{error}</Alert>}
            {!editor && warning && <Alert severity="warning">{warning}</Alert>}
            {!editor && notice && <Alert severity="success">{notice}</Alert>}
            <Button disabled={Boolean(working)} onClick={closeLibrary} sx={{ alignSelf: "flex-end" }}>Close</Button>
          </Stack>
        </ModalShell>
      )}
      {active && opened && editor && (
        <ModalShell label={dialogTitle(editor)} onDismiss={close} restoreFocusRef={restoreFocus}
          fallbackFocusRefs={fallbackFocusRefs} contentStyle={{ width: "min(680px, calc(100vw - 32px))" }}>
          <Stack spacing={2} sx={{ p: 2 }}>
            <Typography component="h3" variant="h6">{dialogTitle(editor)}</Typography>
            {editor.kind !== "delete" && editor.kind !== "default" && <>
              <TextField label="Voice name" value={editor.name} disabled={locked} fullWidth
                slotProps={{ htmlInput: { maxLength: NAME_LIMIT } }}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
              <TextField label={editor.kind === "design" ? "Describe the voice" : "Description (optional)"}
                value={editor.description} disabled={locked} fullWidth multiline minRows={2}
                slotProps={{ htmlInput: { maxLength: DESCRIPTION_LIMIT } }}
                helperText={editor.kind === "design" ? "Describe the accent, age, tone, and pace in at least 20 characters." : undefined}
                onChange={(event) => setEditor(editor.kind === "design"
                  ? { ...editor, description: event.target.value, previews: [], selectedPreviewId: "" }
                  : { ...editor, description: event.target.value })} />
            </>}
            {(editor.kind === "clone" || editor.kind === "edit") && (
              <VoiceLabels labels={editor.labels} disabled={locked} error={invalidLabels}
                onChange={(labels) => setEditor({ ...editor, labels, labelsEdited: true })} />
            )}
            {(editor.kind === "clone" || (editor.kind === "edit" && editor.voice.category === "cloned")) && <>
              <Typography variant="body2">
                {editor.kind === "clone"
                  ? "Add up to five short audio recordings. Listen to each sample before sending it to ElevenLabs."
                  : "Append up to five recordings to this clone. ElevenLabs keeps the existing samples and uses the added recordings in future audio."}
              </Typography>
              <UploadButton label="Add voice recordings" accept={SAMPLE_EXTENSIONS} multiple disabled={locked}
                onFiles={(files) => addFiles(editor, files)} />
              {editor.files.map((file, index) => (
                <Paper key={`${file.name}-${file.lastModified}-${index}`} variant="outlined" sx={{ p: 1 }}>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{file.name}</Typography>
                    <AudioPlayer blob={file} label={`Sample ${index + 1}: ${file.name}`} />
                    <Button size="small" disabled={locked} onClick={() => setEditor({
                      ...editor, files: editor.files.filter((_, position) => position !== index), consent: false,
                    })} aria-label={`Remove sample ${index + 1}: ${file.name}`} sx={{ alignSelf: "flex-start" }}>Remove</Button>
                  </Stack>
                </Paper>
              ))}
              {editor.files.length > 0 && <FormControlLabel label="I have permission to share these recordings with ElevenLabs and make this voice available for narration by signed-in users in this workspace."
                control={<Checkbox checked={editor.consent} disabled={locked}
                  onChange={(_, checked) => setEditor({ ...editor, consent: checked })} />} />}
            </>}
            {editor.kind === "design" && <>
              <TextField label="Audition script (optional)" value={editor.text} disabled={locked} fullWidth multiline minRows={2}
                slotProps={{ htmlInput: { maxLength: DESCRIPTION_LIMIT } }}
                helperText="Use at least 100 characters or leave blank to let ElevenLabs choose a script."
                onChange={(event) => setEditor({ ...editor, text: event.target.value, previews: [], selectedPreviewId: "" })} />
              <Button variant="outlined" onClick={() => design(editor)} sx={{ alignSelf: "flex-start" }}
                disabled={locked || editor.description.trim().length < DESIGN_MIN_DESCRIPTION
                  || Boolean(editor.text.trim() && editor.text.trim().length < DESIGN_MIN_TEXT)}>
                Generate previews
              </Button>
              {editor.previews.map((preview, index) => (
                <Paper key={preview.id} variant="outlined" sx={{ p: 1 }}>
                  <Stack spacing={1}>
                    <Typography variant="body2">Preview {index + 1}{preview.duration > 0 ? ` · ${Math.round(preview.duration)} s` : ""}</Typography>
                    <AudioPlayer blob={preview.audio} label={`Designed voice preview ${index + 1}`} />
                    <Button variant={editor.selectedPreviewId === preview.id ? "contained" : "outlined"}
                      aria-pressed={editor.selectedPreviewId === preview.id} disabled={locked}
                      onClick={() => setEditor({ ...editor, selectedPreviewId: preview.id })}
                      sx={{ alignSelf: "flex-start" }}>Choose preview {index + 1}</Button>
                  </Stack>
                </Paper>
              ))}
            </>}
            {editor.kind === "delete" && <Typography>
              Delete {editor.voice.name} from ElevenLabs? The voice will be unavailable for new narration.
              {selectedVoice?.id === editor.voice.voiceId ? " This project will need a new voice selection." : ""}
            </Typography>}
            {editor.kind === "default" && <Typography>
              {editor.voice ? `Use ${editor.voice.name} as the account default for future narration?` : "Clear the account default for future narration?"} Existing audio stays as recorded.
            </Typography>}
            {working && <Typography variant="body2" role="status">{working}…</Typography>}
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button disabled={Boolean(working)} onClick={close}>Cancel</Button>
              {editor.kind === "clone" && <Button variant="contained"
                disabled={locked || !editor.name.trim() || !editor.files.length || !editor.consent || Boolean(invalidLabels)}
                onClick={() => clone(editor)}>Create cloned voice</Button>}
              {editor.kind === "design" && <Button variant="contained"
                disabled={locked || !editor.name.trim() || !editor.selectedPreviewId}
                onClick={() => saveDesign(editor)}>Save chosen voice</Button>}
              {editor.kind === "edit" && <Button variant="contained"
                disabled={locked || !editor.name.trim() || Boolean(editor.files.length && !editor.consent) || Boolean(invalidLabels)}
                onClick={() => edit(editor)}>Save changes</Button>}
              {editor.kind === "delete" && <Button variant="contained" color="error" disabled={locked}
                onClick={() => remove(editor.voice)}>Delete voice</Button>}
              {editor.kind === "default" && <Button variant="contained" disabled={locked}
                onClick={() => changeDefault(editor.voice)}>{editor.voice ? "Set default" : "Clear default"}</Button>}
            </Box>
          </Stack>
        </ModalShell>
      )}
    </Stack>
  );
}

function VoiceLabels({ labels, disabled, error, onChange }: {
  labels: VoiceLabel[];
  disabled: boolean;
  error: string;
  onChange: (labels: VoiceLabel[]) => void;
}) {
  function change(id: string, field: "key" | "value", value: string) {
    onChange(labels.map((label) => label.id === id ? { ...label, [field]: value } : label));
  }

  return (
    <Stack spacing={1}>
      {labels.map((label, index) => (
        <Stack key={label.id} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
          <TextField size="small" label={`Label ${index + 1} name`} placeholder="For example, language"
            value={label.key} disabled={disabled} slotProps={{ htmlInput: { maxLength: LABEL_KEY_LIMIT } }}
            onChange={(event) => change(label.id, "key", event.target.value)} />
          <TextField size="small" label={`Label ${index + 1} value`} value={label.value} disabled={disabled}
            slotProps={{ htmlInput: { maxLength: LABEL_VALUE_LIMIT } }} onChange={(event) => change(label.id, "value", event.target.value)} />
          <Button size="small" disabled={disabled} aria-label={`Remove label ${index + 1}`}
            onClick={() => onChange(labels.filter(({ id }) => id !== label.id))}>Remove</Button>
        </Stack>
      ))}
      {error && <Typography variant="body2" color="error">{error}</Typography>}
      <Button size="small" disabled={disabled || labels.length >= LABEL_LIMIT} sx={{ alignSelf: "flex-start" }}
        onClick={() => onChange([...labels, { id: crypto.randomUUID(), key: "", value: "" }])}>Add voice label</Button>
    </Stack>
  );
}
