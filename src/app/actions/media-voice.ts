"use server";

import { splitNarrationText } from "@/lib/narration-chunks";
import { saveRecordingFile, getRecordingFileUrl } from "@/lib/recording-files";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { getUserStyle, saveUserStyle, clearVoiceClone } from "@/lib/user-style";

// ── Voice / writing style (ElevenLabs + user_style) ─────────────────────────
// Split out of media.ts (which was pushing the 1000-line cap) with no
// behaviour change - every export below keeps its exact name, signature, and
// semantics from before the split.

/** Whether the ElevenLabs voice API is configured (for the UI to gate buttons). */
export async function voiceConfiguredAction(): Promise<{ configured: boolean }> {
  try {
    await requireOwner();
    return { configured: !!process.env.ELEVENLABS_API_KEY?.trim() };
  } catch {
    return { configured: false };
  }
}

/** List available ElevenLabs stock voices. */
export async function listElevenVoicesAction(): Promise<
  { voices: Array<{ voiceId: string; name: string; category: string }> } | { error: string }
> {
  try {
    await requireOwner();
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) return { error: "Voice generation is not configured. Set ELEVENLABS_API_KEY." };
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { error: `Voice service error (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` };
    }
    const data = (await res.json().catch(() => null)) as { voices?: Array<{ voice_id?: string; name?: string; category?: string }> } | null;
    if (!data?.voices) return { error: "Could not fetch voice list." };
    const voices = data.voices
      .filter((v) => v.voice_id && v.name)
      .map((v) => ({
        voiceId: v.voice_id!,
        name: v.name!,
        category: v.category ?? "",
      }));
    return { voices };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list voices." };
  }
}

/** Get the user's voice and writing style settings. */
export async function getUserStyleAction(): Promise<
  { style: { voiceId: string | null; voiceSampleName: string | null; hasVoiceSample: boolean; writingSample: string | null } } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const style = await getUserStyle(supabase, user.id);
    return {
      style: {
        voiceId: style?.voiceId ?? null,
        voiceSampleName: style?.voiceSampleName ?? null,
        hasVoiceSample: !!style?.voiceSamplePath,
        writingSample: style?.writingSample ?? null,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your voice and writing settings." };
  }
}

/** Save or update the writing sample (capped at 20k chars; empty clears it). */
export async function saveWritingSampleAction(text: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const trimmed = text.trim();
    if (trimmed.length > 20_000) {
      return { error: "Keep the writing sample under 20,000 characters." };
    }
    await saveUserStyle(supabase, user.id, {
      writingSample: trimmed || null,
    });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save your writing sample." };
  }
}

/**
 * Create or replace the user's cloned voice from audio samples.
 * Uploads the first sample file and stores voice_id and sample metadata.
 * Best-effort deletes the old ElevenLabs voice if a different one exists.
 */
export async function setVoiceCloneAction(
  name: string,
  files: Array<{ base64: string; mimeType: string; fileName: string }>
): Promise<{ voiceId: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    // Use the existing createVoiceCloneAction flow
    const cloneResult = await createVoiceCloneAction(name, files);
    if ("error" in cloneResult) {
      return cloneResult;
    }

    const newVoiceId = cloneResult.voiceId;

    // Upload the first sample file
    if (!files.length) {
      return { error: "No audio samples provided." };
    }

    const firstFile = files[0];
    const bytes = Buffer.from(firstFile.base64, "base64");
    const blob = new Blob([new Uint8Array(bytes)], { type: firstFile.mimeType || "audio/mpeg" });

    const recordingFile = await saveRecordingFile(supabase, user.id, blob, {
      name: `Voice sample - ${name}`,
      kind: "file",
      mimeType: firstFile.mimeType || "audio/mpeg",
      durationSec: null,
      source: "voice-sample",
    });

    // Get the old voice ID to delete later
    const oldStyle = await getUserStyle(supabase, user.id);
    const oldVoiceId = oldStyle?.voiceId;

    // Save the new voice settings
    await saveUserStyle(supabase, user.id, {
      voiceId: newVoiceId,
      voiceSamplePath: recordingFile.storagePath,
      voiceSampleName: recordingFile.name,
    });

    // Best-effort delete old ElevenLabs voice
    if (oldVoiceId && oldVoiceId !== newVoiceId) {
      const key = process.env.ELEVENLABS_API_KEY?.trim();
      if (key) {
        try {
          await fetch(`https://api.elevenlabs.io/v1/voices/${oldVoiceId}`, {
            method: "DELETE",
            headers: { "xi-api-key": key },
          });
        } catch {
          // Ignore deletion failures
        }
      }
    }

    return { voiceId: newVoiceId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set up your cloned voice." };
  }
}

/** Remove the cloned voice and clear the sample. */
export async function removeVoiceCloneAction(): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const style = await getUserStyle(supabase, user.id);
    if (!style) {
      return { ok: true };
    }

    const voiceId = style.voiceId;

    // Best-effort delete ElevenLabs voice
    if (voiceId) {
      const key = process.env.ELEVENLABS_API_KEY?.trim();
      if (key) {
        try {
          await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
            method: "DELETE",
            headers: { "xi-api-key": key },
          });
        } catch {
          // Ignore deletion failures
        }
      }
    }

    // Remove sample file best-effort
    if (style.voiceSamplePath) {
      try {
        await supabase.storage.from("recordings").remove([style.voiceSamplePath]);
      } catch {
        // Ignore deletion failures
      }
    }

    // Clear all voice settings
    await clearVoiceClone(supabase, user.id);

    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove your cloned voice." };
  }
}

/** Get a signed URL for the stored voice sample (3600s expiration). */
export async function getVoiceSampleUrlAction(): Promise<{ url: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const style = await getUserStyle(supabase, user.id);
    if (!style?.voiceSamplePath) {
      return { error: "No voice sample stored." };
    }

    const url = await getRecordingFileUrl(
      supabase,
      {
        id: "",
        name: "",
        kind: "file",
        mimeType: "",
        sizeBytes: 0,
        durationSec: null,
        storagePath: style.voiceSamplePath,
        source: null,
        origin: null,
        workflowName: null,
        workflowId: null,
        workflowRunId: null,
        createdAt: "",
      },
      3600
    );
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the voice sample URL." };
  }
}

/**
 * Resolve the narration voice ID for the given user.
 * Resolution order: voiceIdOverride -> user_style.voice_id -> env ELEVENLABS_VOICE_ID -> stock.
 */
async function resolveNarrationVoiceId(userId: string, voiceIdOverride?: string): Promise<string> {
  if (voiceIdOverride?.trim()) {
    return voiceIdOverride.trim();
  }

  const supabase = createServiceClient();
  const style = await getUserStyle(supabase, userId);
  if (style?.voiceId) {
    return style.voiceId;
  }

  return process.env.ELEVENLABS_VOICE_ID?.trim() || "21m00Tcm4TlvDq8ikWAM";
}

/**
 * Internal helper: make one ElevenLabs text-to-speech call and return the audio buffer.
 * Throws on !res.ok with the formatted error text.
 */
async function synthesizeSegment(
  key: string,
  voiceId: string,
  text: string
): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voice service error (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Synthesize one narration segment with ElevenLabs and return it as base64
 * MP3. Called per slide so responses stay small. Uses ELEVENLABS_API_KEY and
 * optional ELEVENLABS_VOICE_ID (defaults to the standard "Rachel" voice until
 * the user's cloned voice id is configured).
 */
export async function synthesizeNarrationAction(
  text: string,
  voiceIdOverride?: string
): Promise<{ base64: string; mimeType: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) return { error: "Voice generation is not configured. Set ELEVENLABS_API_KEY (and ELEVENLABS_VOICE_ID for your cloned voice)." };
    const t = text.trim();
    if (!t) return { error: "Nothing to synthesize." };
    if (t.length > 4000) return { error: "That segment is too long for one synthesis call." };
    const voiceId = await resolveNarrationVoiceId(user.id, voiceIdOverride);
    const buf = await synthesizeSegment(key, voiceId, t);
    return { base64: buf.toString("base64"), mimeType: "audio/mpeg" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not synthesize audio." };
  }
}

/**
 * Synthesize a long narration script by automatically chunking it into segments
 * (sentence-safe splits, max 3800 chars each) and concatenating the audio.
 * Handles scripts up to ~38k chars (about 10 segments, 25 minutes of speech).
 * Returns concatenated MPEG audio frames (standard players read as one stream).
 */
export async function synthesizeLongNarrationAction(
  text: string,
  voiceIdOverride?: string
): Promise<{ base64: string; mimeType: string; segments: number } | { error: string }> {
  try {
    const user = await requireOwner();
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) return { error: "Voice generation is not configured. Set ELEVENLABS_API_KEY (and ELEVENLABS_VOICE_ID for your cloned voice)." };
    const t = text.trim();
    if (!t) return { error: "Nothing to synthesize." };
    // 10-chunk ceiling keeps the call inside the platform's 60s function cap.
    if (t.length > 38_000) return { error: "The script is too long to narrate (about 25 minutes of speech). Reduce the script minutes." };
    const voiceId = await resolveNarrationVoiceId(user.id, voiceIdOverride);
    const chunks = splitNarrationText(t);
    if (chunks.length > 10) return { error: "The script is too long to narrate (about 25 minutes of speech). Reduce the script minutes." };
    const buffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const buf = await synthesizeSegment(key, voiceId, chunks[i]);
        buffers.push(buf);
      } catch (err) {
        return { error: `Segment ${i + 1} of ${chunks.length}: ${err instanceof Error ? err.message : "Could not synthesize audio."}` };
      }
    }
    // ElevenLabs returns raw MPEG audio frames; byte concatenation of consecutive
    // segments plays as one continuous stream in standard players.
    const payload = Buffer.concat(buffers);
    return { base64: payload.toString("base64"), mimeType: "audio/mpeg", segments: chunks.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not synthesize audio." };
  }
}

/**
 * Create an ElevenLabs instant voice clone from uploaded audio samples and
 * return its voice id. Samples must total under ~7 MB (server action body cap).
 */
export async function createVoiceCloneAction(
  name: string,
  files: Array<{ base64: string; mimeType: string; fileName: string }>
): Promise<{ voiceId: string } | { error: string }> {
  try {
    await requireOwner();
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) return { error: "Set ELEVENLABS_API_KEY to create a voice clone." };
    if (!name.trim()) return { error: "Name the voice (e.g. your own name)." };
    if (!files.length) return { error: "Upload at least one audio sample." };
    const totalBytes = files.reduce((s, f) => s + Math.ceil(f.base64.length * 0.75), 0);
    if (totalBytes > 7 * 1024 * 1024) return { error: "Samples are too large (7 MB total limit here). One to three minutes of clean audio is enough." };
    const form = new FormData();
    form.append("name", name.trim());
    for (const f of files) {
      const bytes = Buffer.from(f.base64, "base64");
      form.append("files", new Blob([new Uint8Array(bytes)], { type: f.mimeType || "audio/mpeg" }), f.fileName || "sample.mp3");
    }
    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    const data = (await res.json().catch(() => null)) as { voice_id?: string; detail?: { message?: string } | string } | null;
    if (!res.ok || !data?.voice_id) {
      const msg = typeof data?.detail === "string" ? data.detail : data?.detail?.message;
      if (msg && msg.toLowerCase().includes("does not include instant voice cloning")) {
        return { error: "Your ElevenLabs plan does not include instant voice cloning (it needs Starter or higher). Pick a ready-made voice below instead - all narration features work with it." };
      }
      return { error: `Voice clone failed (HTTP ${res.status})${msg ? `: ${msg.slice(0, 200)}` : ""}` };
    }
    return { voiceId: data.voice_id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the voice clone." };
  }
}
