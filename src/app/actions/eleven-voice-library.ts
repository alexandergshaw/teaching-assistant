"use server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { saveUserStyle } from "@/lib/user-style";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { synthesizeNarrationAction } from "./media-voice";

const API = "https://api.elevenlabs.io";
const MAX_SAMPLES = 5;
const MAX_SAMPLE_BYTES = UPLOAD_WIRE_BUDGET_BYTES - 16 * 1024;
const SAMPLE_EXTENSION = /\.(?:mp3|wav|m4a|aac|ogg|opus|webm|flac)$/i;
const PERSONAL_CATEGORIES = new Set(["cloned", "generated", "professional"]);
const DEFAULT_SAMPLE_TEXT = "Here is a short sample of this voice. Listen for its pace, tone, and clarity.";

export type ElevenManagedVoice = {
  voiceId: string;
  name: string;
  category: string;
  description: string;
  labels: Record<string, string>;
  manageable: boolean;
  verificationRequired: boolean;
};

type VoiceResponse = {
  voice_id?: unknown;
  name?: unknown;
  category?: unknown;
  description?: unknown;
  labels?: unknown;
  is_owner?: unknown;
  is_legacy?: unknown;
  voice_verification?: { requires_verification?: unknown; is_verified?: unknown } | null;
};

type VoicePreview = { generatedVoiceId: string; base64: string; mimeType: string; durationSec: number };
type VoiceError = { error: string };
type Updated = { ok: true } | VoiceError;

function voiceError(error: unknown, fallback: string): VoiceError {
  return { error: error instanceof Error && error.name === "Error" ? error.message : fallback };
}

function voiceKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("Voice generation is not configured. Set ELEVENLABS_API_KEY.");
  return key;
}

function configuredVoiceId(): string | null {
  const id = process.env.ELEVENLABS_VOICE_ID?.trim();
  return id && isVoiceId(id) ? id : null;
}

function isVoiceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z\d_-]{1,128}$/i.test(value);
}

function requireVoiceId(value: unknown): string {
  if (!isVoiceId(value)) throw new Error("Choose a valid ElevenLabs voice.");
  return value;
}

function textField(value: unknown, name: string, max: number, min = 0): string {
  if (typeof value !== "string") throw new Error(`Enter ${name.toLowerCase()}.`);
  const text = value.trim();
  if (text.length > max || text.length < min) {
    throw new Error(min > 1 ? `${name} must be ${min}–${max} characters.` : `${name} must ${min ? "contain 1–" : "be at most "}${max} characters.`);
  }
  return text;
}

function appendLabels(source: FormData, destination: FormData): void {
  const raw = source.get("labels");
  if (raw === null) return;
  const invalidLabels = "Use at most 16 voice labels, with a name up to 40 characters and a value up to 120 characters for each.";
  if (typeof raw !== "string" || raw.length > 4000) throw new Error(invalidLabels);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(invalidLabels); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(invalidLabels);
  const labels = Object.entries(parsed);
  if (labels.length > 16 || labels.some(([key, value]) => !key.trim() || key.length > 40 || typeof value !== "string" || !value.trim() || value.length > 120)) {
    throw new Error(invalidLabels);
  }
  destination.set("labels", JSON.stringify(Object.fromEntries(labels)));
}

function appendSamples(source: FormData, destination: FormData, samples: FormDataEntryValue[]): void {
  if (!samples.length || samples.length > MAX_SAMPLES) throw new Error("Choose one to five audio samples.");
  if (source.get("consent") !== "true") throw new Error("Confirm you have permission to use these samples for voice cloning.");
  let bytes = 0;
  for (const file of samples) {
    if (typeof file === "string" || !file.size || file.name.length > 255 || !SAMPLE_EXTENSION.test(file.name)
      || (file.type && !file.type.startsWith("audio/") && !["application/ogg", "application/octet-stream", "video/webm"].includes(file.type))) {
      throw new Error("Choose non-empty MP3, WAV, M4A, AAC, Ogg, Opus, WebM, or FLAC audio samples.");
    }
    bytes += file.size;
    if (bytes > MAX_SAMPLE_BYTES) throw new Error("The total size of the audio samples exceeds the upload limit.");
    destination.append("files", file);
  }
}

class VoiceHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function voiceRequest(key: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("xi-api-key", key);
  const response = await fetch(`${API}${path}`, { ...init, headers, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(25_000) });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("ElevenLabs denied this request. Check the API key permissions and subscription in ElevenLabs.");
    if (response.status === 429) throw new Error("ElevenLabs reached a usage limit. Check your subscription or try again later.");
    if (response.status === 404) throw new VoiceHttpError("This ElevenLabs voice is no longer available.", 404);
    throw new Error(`ElevenLabs could not complete the request (HTTP ${response.status}).`);
  }
  return response;
}

function jsonRequest(body: Record<string, unknown>): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function toManagedVoice(voice: VoiceResponse | null): ElevenManagedVoice | null {
  if (!voice || !isVoiceId(voice.voice_id)) return null;
  const category = typeof voice.category === "string" ? voice.category : "";
  return {
    voiceId: voice.voice_id,
    name: typeof voice.name === "string" && voice.name.trim() ? voice.name : "Unnamed voice",
    category,
    description: typeof voice.description === "string" ? voice.description : "",
    labels: Object.fromEntries(voice.labels && typeof voice.labels === "object" && !Array.isArray(voice.labels)
      ? Object.entries(voice.labels).filter(([key, value]) => key.length <= 40 && typeof value === "string" && value.length <= 120).slice(0, 16) : []),
    manageable: voice.is_owner === true && voice.is_legacy !== true && PERSONAL_CATEGORIES.has(category),
    verificationRequired: voice.voice_verification?.requires_verification === true && voice.voice_verification.is_verified !== true,
  };
}

async function getVoice(key: string, voiceId: string): Promise<ElevenManagedVoice> {
  const response = await voiceRequest(key, `/v1/voices/${voiceId}`);
  const voice = toManagedVoice(await response.json());
  if (!voice || voice.voiceId !== voiceId) throw new Error("ElevenLabs returned incomplete voice information.");
  return voice;
}

async function requireManageableVoice(key: string, voiceId: string): Promise<ElevenManagedVoice> {
  const voice = await getVoice(key, voiceId);
  if (!voice.manageable) throw new Error("Only personal voices owned by this ElevenLabs account can be managed.");
  return voice;
}

async function getStyleVoiceId(userId: string): Promise<string | null> {
  const { data, error } = await createServiceClient().from("user_style").select("voice_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not read the default voice.");
  return isVoiceId(data?.voice_id) ? data.voice_id : null;
}

async function clearSelectedVoiceIfCurrent(voiceId: string, userId?: string): Promise<void> {
  const query = createServiceClient().from("user_style")
    .update({ voice_id: null, updated_at: new Date().toISOString() }).eq("voice_id", voiceId).is("voice_sample_path", null);
  const { error } = await (userId ? query.eq("user_id", userId) : query);
  if (error) throw new Error("Could not reconcile the saved default. Refresh the voice library before making another change.");
}

export async function listElevenVoiceLibraryAction(): Promise<
  { voices: ElevenManagedVoice[]; defaultVoiceId: string | null; hasAccountDefault: boolean } | VoiceError
> {
  try {
    const owner = await requireAppOwner();
    const key = voiceKey();
    const selected = await getStyleVoiceId(owner.id);
    const voices = new Map<string, ElevenManagedVoice>();
    const tokens = new Set<string>();
    const signal = AbortSignal.timeout(25_000);
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ page_size: "100", include_total_count: "false" });
      if (token) params.set("next_page_token", token);
      const response = await voiceRequest(key, `/v2/voices?${params}`, { signal });
      const data = (await response.json()) as { voices?: VoiceResponse[]; has_more?: boolean; next_page_token?: string };
      if (!Array.isArray(data?.voices) || typeof data.has_more !== "boolean") throw new Error("ElevenLabs returned an incomplete voice library.");
      for (const item of data.voices) {
        const voice = toManagedVoice(item);
        if (voice) voices.set(voice.voiceId, voice);
      }
      if (!data.has_more) return { voices: [...voices.values()], defaultVoiceId: selected ?? configuredVoiceId(), hasAccountDefault: selected !== null };
      token = data.next_page_token;
      if (typeof token !== "string" || !token.length || tokens.has(token)) throw new Error("ElevenLabs did not return the next voice page.");
      tokens.add(token);
    }
    return { error: "The ElevenLabs voice library is too large to load in one request." };
  } catch (error) {
    return voiceError(error, "Could not load the ElevenLabs voice library.");
  }
}

export async function auditionElevenVoiceAction(voiceId: string, text?: string): Promise<{ base64: string; mimeType: string } | VoiceError> {
  try {
    await requireAppOwner();
    const id = requireVoiceId(voiceId);
    const script = textField(text ?? "", "Preview text", 300) || DEFAULT_SAMPLE_TEXT;
    if ((await getVoice(voiceKey(), id)).verificationRequired) return { error: "Finish verification in ElevenLabs before using this voice." };
    return await synthesizeNarrationAction(script, id);
  } catch (error) {
    return voiceError(error, "Could not preview this voice.");
  }
}

export async function cloneElevenVoiceAction(form: FormData): Promise<{ voiceId: string; verificationRequired: boolean } | VoiceError> {
  try {
    await requireAppOwner();
    const key = voiceKey();
    if (!(form instanceof FormData)) return { error: "Upload audio samples to clone a voice." };
    const name = textField(form.get("name"), "Voice name", 100, 1);
    const description = textField(form.get("description") ?? "", "Description", 1000);
    const body = new FormData();
    body.set("name", name);
    if (description) body.set("description", description);
    appendLabels(form, body);
    appendSamples(form, body, form.getAll("files"));
    const response = await voiceRequest(key, "/v1/voices/add", { method: "POST", body, signal: AbortSignal.timeout(50_000) });
    const data = await response.json();
    if (!isVoiceId(data?.voice_id) || typeof data.requires_verification !== "boolean") throw new Error("ElevenLabs did not confirm the clone and its verification status. Refresh the library before retrying.");
    return { voiceId: data.voice_id, verificationRequired: data.requires_verification || Boolean(data.library_voice_match) };
  } catch (error) {
    return voiceError(error, "Could not create the voice clone. Refresh the library before retrying.");
  }
}

export async function designElevenVoiceAction(description: string, text?: string): Promise<{ previews: VoicePreview[] } | VoiceError> {
  try {
    await requireAppOwner();
    const voiceDescription = textField(description, "Voice description", 1000, 20);
    const previewText = text === undefined || (typeof text === "string" && !text.trim()) ? "" : textField(text, "Preview text", 1000, 100);
    const response = await voiceRequest(voiceKey(), "/v1/text-to-voice/design?output_format=mp3_22050_32", {
      ...jsonRequest({ voice_description: voiceDescription, ...(previewText ? { text: previewText } : { auto_generate_text: true }) }),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await response.json();
    if (!Array.isArray(data?.previews) || !data.previews.length || data.previews.length > 3) throw new Error("ElevenLabs returned an unexpected set of previews.");
    const previews: VoicePreview[] = [];
    let bytes = 0;
    for (const preview of data.previews) {
      if (!isVoiceId(preview?.generated_voice_id) || typeof preview.audio_base_64 !== "string" || !preview.audio_base_64.length
        || !Number.isFinite(preview.duration_secs) || preview.duration_secs <= 0) throw new Error("ElevenLabs returned an incomplete voice preview.");
      bytes += preview.audio_base_64.length;
      if (bytes > UPLOAD_WIRE_BUDGET_BYTES - 2048) throw new Error("The generated previews exceed the playback limit. Try shorter preview text.");
      previews.push({ generatedVoiceId: preview.generated_voice_id, base64: preview.audio_base_64, mimeType: "audio/mpeg", durationSec: preview.duration_secs });
    }
    return { previews };
  } catch (error) {
    return voiceError(error, "Could not design a voice.");
  }
}

export async function saveDesignedElevenVoiceAction(generatedVoiceId: string, name: string, description: string): Promise<{ voiceId: string } | VoiceError> {
  try {
    await requireAppOwner();
    const response = await voiceRequest(voiceKey(), "/v1/text-to-voice", jsonRequest({
      generated_voice_id: requireVoiceId(generatedVoiceId),
      voice_name: textField(name, "Voice name", 100, 1),
      voice_description: textField(description, "Voice description", 1000, 20),
    }));
    const data = await response.json();
    if (!isVoiceId(data?.voice_id)) throw new Error("ElevenLabs did not confirm the saved voice. Refresh the library before retrying.");
    return { voiceId: data.voice_id };
  } catch (error) {
    return voiceError(error, "Could not save the designed voice. Refresh the library before retrying.");
  }
}

export async function updateElevenVoiceAction(voiceId: string, name: string, description: string, extras?: FormData): Promise<Updated> {
  try {
    await requireAppOwner();
    const id = requireVoiceId(voiceId);
    const body = new FormData();
    body.set("name", textField(name, "Voice name", 100, 1));
    body.set("description", textField(description, "Description", 1000));
    const samples = extras?.getAll("files") ?? [];
    if (extras) appendLabels(extras, body);
    if (extras && samples.length) appendSamples(extras, body, samples);
    const key = voiceKey();
    const voice = await requireManageableVoice(key, id);
    if (samples.length && voice.category !== "cloned") return { error: "You can add samples only to instant voice clones." };
    const response = await voiceRequest(key, `/v1/voices/${id}/edit`, { method: "POST", body });
    if ((await response.json())?.status !== "ok") throw new Error("ElevenLabs did not confirm the voice update.");
    return { ok: true };
  } catch (error) {
    return voiceError(error, "Could not update this voice.");
  }
}

export async function deleteElevenVoiceAction(voiceId: string): Promise<{ ok: true; warning?: string } | VoiceError> {
  try {
    await requireAppOwner();
    const id = requireVoiceId(voiceId);
    if (id === configuredVoiceId()) return { error: "This voice is configured as the workspace default. Change that configuration before deleting it." };
    const key = voiceKey();
    await requireManageableVoice(key, id);
    const { data, error } = await createServiceClient().from("user_style").select("user_id").eq("voice_id", id).limit(1);
    if (error || !Array.isArray(data)) return { error: "Could not verify whether this voice is used as a default. No voice was deleted." };
    if (data.length) return { error: "This voice is a saved default. Change the default before deleting it." };
    const response = await voiceRequest(key, `/v1/voices/${id}`, { method: "DELETE" });
    if ((await response.json())?.status !== "ok") throw new Error("ElevenLabs did not confirm the voice deletion. Refresh the library before retrying.");
    // A simultaneous selection can pass its provider pre-check before the deletion completes.
    try {
      await clearSelectedVoiceIfCurrent(id);
    } catch {
      return { ok: true, warning: "ElevenLabs deleted the voice, but an account default could not be reconciled. Refresh the voice library." };
    }
    return { ok: true };
  } catch (error) {
    return voiceError(error, "Could not delete this voice. Refresh the library before retrying.");
  }
}

export async function setDefaultElevenVoiceAction(voiceId: string | null): Promise<Updated> {
  try {
    const owner = await requireAppOwner();
    const id = voiceId === null ? null : requireVoiceId(voiceId);
    const key = id ? voiceKey() : null;
    if (id && key && (await getVoice(key, id)).verificationRequired) return { error: "Finish verification in ElevenLabs before setting this voice as the default." };
    if ((await getStyleVoiceId(owner.id)) !== id) {
      // Selecting a provider voice does not make it the legacy uploaded clone.
      await saveUserStyle(createServiceClient(), owner.id, { voiceId: id, voiceSamplePath: null, voiceSampleName: null });
      if (id && key) {
        try {
          await getVoice(key, id);
        } catch (error) {
          if (!(error instanceof VoiceHttpError) || error.status !== 404) {
            return { error: "The account preference was saved, but ElevenLabs availability could not be confirmed. Refresh the library to check it." };
          }
          await clearSelectedVoiceIfCurrent(id, owner.id);
          return { error: "This voice was deleted while you selected it. Choose a different default." };
        }
      }
    }
    return { ok: true };
  } catch (error) {
    return voiceError(error, "Could not change the default voice.");
  }
}
