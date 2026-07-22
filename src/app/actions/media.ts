"use server";

import type { SlideNarration, ScreenCaption } from "../actions-types";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { callLlm, type LlmProvider, type LlmPart } from "@/lib/llm";
import { generateDeckFromTemplate, type DeckGenContext, type GeneratedDeck } from "@/lib/decks/generate";
import { type DeckTemplate, type DeckTheme } from "@/lib/decks/types";
import { listDeckTemplates } from "@/lib/deck-templates";
import { DECK_PRESETS } from "@/lib/decks/presets";
import { buildSlidesPptx, type PptxSlide, type PptxTheme } from "@/lib/pptx";
import { saveRecordingFile } from "@/lib/recording-files";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { createPresentationDraft, markPresentationDraftReviewed, updatePresentationDraft, type PresentationDraftPayload } from "@/lib/presentation-drafts";
import { splitNarrationText } from "@/lib/narration-chunks";
import { getUserStyle, saveUserStyle, clearVoiceClone } from "@/lib/user-style";
import { getRecordingFileUrl } from "@/lib/recording-files";
import { extractTextbookInfoFromImages, getWritingStyleBlock, jsonObjectSlice } from "./shared";


// ── Presentation Drafts (Chunk 4) ──────────────────────────────────────────

/** Save a new pending presentation draft. */
export async function savePresentationDraftAction(
  summary: string,
  payload: PresentationDraftPayload,
  workflowId?: string,
  workflowName?: string
): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await createPresentationDraft(supabase, user.id, {
      summary,
      payload,
      workflowId,
      workflowName,
    });
    return { id: draft.id };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save the presentation draft.",
    };
  }
}

/** List pending presentation drafts for the owner. */

/** Mark a draft reviewed. Idempotent. */
export async function markPresentationDraftReviewedAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await markPresentationDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not update the presentation draft.",
    };
  }
}

/** Update a draft's payload. */
export async function updatePresentationDraftPayloadAction(
  id: string,
  payload: PresentationDraftPayload
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await updatePresentationDraft(supabase, user.id, id, { payload });
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save the presentation draft.",
    };
  }
}

// ── Deck Templates (Chunk 5) ──────────────────────────────────────────

/** List all saved deck templates for the owner. */
export async function listDeckTemplatesAction(): Promise<{ templates: DeckTemplate[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    return { templates: await listDeckTemplates(supabase, user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list templates." };
  }
}

/** Load a deck template by id or name (including presets). */
export async function getDeckTemplateAction(
  idOrName: string
): Promise<{ template: DeckTemplate } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const all = await listDeckTemplates(supabase, user.id);
    const key = String(idOrName ?? "").trim();
    // Also let presets resolve by id/name so a workflow can target a built-in template.
    const pool = [...DECK_PRESETS, ...all];
    const found =
      pool.find((t) => t.id === key) ||
      pool.find((t) => t.name.trim().toLowerCase() === key.toLowerCase());
    if (!found) return { error: `No deck template matches "${key}".` };
    return { template: found };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the template." };
  }
}

/**
 * Generate a slide deck (title + content slides with bullets) as structured data
 * for buildSlidesPptx. Used by "Add to each" to produce a branded .pptx file.
 */
export async function generateSlidesAction(
  prompt: string,
  provider: LlmProvider = "gemini"
): Promise<{ presentationTitle: string; slides: Array<{ title: string; bullets: string[] }> } | { error: string }> {
  try {
    await requireOwner();
    if (!prompt.trim()) {
      return { error: "Describe the slides to generate first." };
    }

    // Embedded Deterministic Engine: template a deck outline from the prompt with
    // no model call.
    if (provider === "embedded") {
      return scaffoldLessonPlan(prompt);
    }

    const llmPrompt = `You are an expert educator creating a clear, professional slide deck for students.

TOPIC / INSTRUCTION:
${prompt.trim()}

Return ONLY valid JSON in this shape:
{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "..."] }
  ]
}

Requirements:
- 5-12 content slides, each with a short title and 3-6 concise bullet points.
- Clear, well-organized, and professional.
- Do not invent specific facts, dates, names, or links that were not provided.
- If the deck teaches concepts, append these closing slides at the very END, in order: (a) 2-3 slides whose "title" begins with "Additional Practice:" posing review questions on the material, each immediately followed by an "Answer:" slide with the solution; (b) a slide whose "title" begins with "Documentation:" that recaps the key concepts and terms as a study reference; (c) a slide titled "Documentation & References" that names authoritative resources / official documentation for the tools or topics mentioned. Name only well-known resources; do not invent specific URLs or facts.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Slide generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      return { error: "Could not parse slide data from the model response." };
    }

    let parsed: { presentationTitle?: unknown; slides?: unknown };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { error: "The model returned invalid slide JSON." };
    }

    const presentationTitle = typeof parsed.presentationTitle === "string" ? parsed.presentationTitle.trim() : "";
    const slides = (Array.isArray(parsed.slides) ? parsed.slides : [])
      .map((s) => {
        const obj = (s ?? {}) as { title?: unknown; bullets?: unknown };
        const title = typeof obj.title === "string" ? obj.title.trim() : "";
        const bullets = Array.isArray(obj.bullets)
          ? obj.bullets.filter((b): b is string => typeof b === "string" && b.trim() !== "").map((b) => b.trim())
          : [];
        return { title, bullets };
      })
      .filter((s) => s.title || s.bullets.length > 0);

    if (slides.length === 0) {
      return { error: "The model returned no slides." };
    }
    return { presentationTitle: presentationTitle || "Presentation", slides };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Standalone: extract textbook / course-materials details from one or more
 * uploaded photos/screenshots, for use outside the syllabus flow (e.g. the
 * Courses hub). Returns the extracted plain-text block, or "" if nothing found.
 */
export async function extractTextbookInfoAction(
  images: Array<{ base64: string; mimeType: string }>,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!images || images.length === 0) return { error: "Upload at least one image." };
    return { text: await extractTextbookInfoFromImages(images, provider) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the textbook image." };
  }
}

/**
 * Write a spoken-word lecture script for recording (teleprompter-ready).
 * Targets roughly 140 words per minute of the requested duration.
 */
export async function generateLectureScriptAction(
  topic: string,
  objectives: string,
  targetMinutes: number,
  provider: LlmProvider = "gemini"
): Promise<{ script: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!topic.trim()) return { error: "Enter a lecture topic." };
    const minutes = Number.isFinite(targetMinutes) && targetMinutes >= 1 && targetMinutes <= 30 ? Math.round(targetMinutes) : 5;
    const words = minutes * 140;
    const styleBlock = await getWritingStyleBlock(user.id);
    const parts: LlmPart[] = [
      {
        text: [
          `Write a spoken-word lecture script for a college instructor to read aloud on camera about: ${topic.trim()}.`,
          objectives.trim() ? `Cover these objectives/notes:\n${objectives.trim()}` : "",
          `Target length: about ${words} words (${minutes} minutes at a natural speaking pace).`,
          "Rules: conversational but precise; short sentences; first person; open with a one-sentence hook and end with a brief recap plus what students should do next. Insert [PAUSE] on its own line between major sections. Return ONLY the script as plain text - no headings, no markdown, no stage directions other than [PAUSE]." + styleBlock,
        ].filter(Boolean).join("\n\n"),
      },
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.6, maxOutputTokens: 4096 } },
      provider
    );
    if (!r.ok || !r.text.trim()) return { error: "The model returned no script. Try again." };
    return { script: r.text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the script." };
  }
}

/** One slide's extracted text plus its AI narration. */

export async function extractPptxSlidesAction(
  base64: string
): Promise<{ slides: Array<{ slide: number; title: string; text: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (!base64) return { error: "Upload a .pptx file." };
    const paragraphs = await parseOfficeParagraphs("pptx", Buffer.from(base64, "base64"));
    const bySlide = new Map<number, string[]>();
    for (const p of paragraphs) {
      if (typeof p.slide !== "number" || !p.text.trim()) continue;
      (bySlide.get(p.slide) ?? bySlide.set(p.slide, []).get(p.slide)!).push(p.text.trim());
    }
    const slides = [...bySlide.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slide, texts]) => ({ slide, title: texts[0] ?? `Slide ${slide}`, text: texts.join("\n") }));
    if (!slides.length) return { error: "No slide text found in that file." };
    return { slides };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the PowerPoint." };
  }
}

export async function extractDocxTextAction(
  base64: string
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!base64) return { error: "Upload a .docx file." };
    const paragraphs = await parseOfficeParagraphs("docx", Buffer.from(base64, "base64"));
    const text = paragraphs.map((p) => p.text).join("\n");
    if (!text.trim()) return { error: "No text found in that file." };
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the Word document." };
  }
}

export async function generateSlideNarrationAction(
  slides: Array<{ slide: number; title: string; text: string }>,
  provider: LlmProvider = "gemini"
): Promise<{ narrations: SlideNarration[] } | { error: string }> {
  try {
    await requireOwner();
    if (!slides.length) return { error: "Extract slides first." };
    if (slides.length > 60) return { error: "That deck is too large (60 slide limit)." };
    const parts: LlmPart[] = [
      {
        text: [
          "Write a spoken narration script for a lecture over these presentation slides. For EACH slide write 2-5 conversational first-person sentences an instructor would say while that slide is shown - do not read bullets verbatim; explain them.",
          'Return ONLY a JSON array like [{"slide": 1, "narration": "..."}] covering every slide number given, in order. No markdown.',
          "Slides:",
          slides.map((s) => `Slide ${s.slide}: ${s.text}`).join("\n\n"),
        ].join("\n\n"),
      },
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.5, maxOutputTokens: 8192 } },
      provider
    );
    if (!r.ok) return { error: "The model returned no narration." };
    const raw = parseLenientJsonArray(r.text) as Array<{ slide?: number; narration?: string }> | null;
    if (!raw) return { error: "Could not parse the narration output." };
    const byNum = new Map(raw.filter((x) => typeof x.slide === "number" && typeof x.narration === "string").map((x) => [x.slide as number, (x.narration as string).trim()]));
    const narrations = slides.map((s) => ({ ...s, narration: byNum.get(s.slide) ?? "" }));
    if (narrations.every((n) => !n.narration)) return { error: "The model produced no usable narration." };
    return { narrations };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not write the narration." };
  }
}

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

/** Whether the HeyGen avatar API is configured (for the UI to gate buttons). */
export async function avatarConfiguredAction(): Promise<{ configured: boolean }> {
  try {
    await requireOwner();
    return { configured: !!process.env.HEYGEN_API_KEY?.trim() && !!process.env.HEYGEN_AVATAR_ID?.trim() };
  } catch {
    return { configured: false };
  }
}

/**
 * Start a HeyGen avatar video render of a narration script. Returns the job's
 * video id; poll getAvatarVideoStatusAction until it completes. Env:
 * HEYGEN_API_KEY, HEYGEN_AVATAR_ID, optional HEYGEN_VOICE_ID.
 */
export async function generateAvatarVideoAction(
  script: string
): Promise<{ videoId: string } | { error: string }> {
  try {
    await requireOwner();
    const key = process.env.HEYGEN_API_KEY?.trim();
    const avatarId = process.env.HEYGEN_AVATAR_ID?.trim();
    if (!key || !avatarId) return { error: "Avatar generation is not configured. Set HEYGEN_API_KEY and HEYGEN_AVATAR_ID (your avatar's id)." };
    const t = script.trim();
    if (!t) return { error: "Nothing to render." };
    if (t.length > 9000) return { error: "That script is too long for one avatar video (about 9,000 characters max). Trim the narration or split the deck." };
    const voiceId = process.env.HEYGEN_VOICE_ID?.trim();
    const res = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        video_inputs: [
          {
            character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
            voice: voiceId ? { type: "text", input_text: t, voice_id: voiceId } : { type: "text", input_text: t },
          },
        ],
        dimension: { width: 1280, height: 720 },
      }),
    });
    const data = (await res.json().catch(() => null)) as { data?: { video_id?: string }; error?: { message?: string } } | null;
    if (!res.ok || !data?.data?.video_id) {
      return { error: `Avatar service error (HTTP ${res.status})${data?.error?.message ? `: ${data.error.message}` : ""}` };
    }
    return { videoId: data.data.video_id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the avatar video." };
  }
}

/** Poll a HeyGen render job. status: processing | completed | failed. */
export async function getAvatarVideoStatusAction(
  videoId: string
): Promise<{ status: string; videoUrl: string | null } | { error: string }> {
  try {
    await requireOwner();
    const key = process.env.HEYGEN_API_KEY?.trim();
    if (!key) return { error: "Avatar generation is not configured." };
    if (!videoId.trim()) return { error: "Missing video id." };
    const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: { "X-Api-Key": key },
    });
    const data = (await res.json().catch(() => null)) as { data?: { status?: string; video_url?: string | null; error?: { message?: string } | null } } | null;
    if (!res.ok || !data?.data?.status) return { error: `Avatar status error (HTTP ${res.status}).` };
    if (data.data.status === "failed") return { error: `Avatar render failed${data.data.error?.message ? `: ${data.data.error.message}` : ""}.` };
    return { status: data.data.status, videoUrl: data.data.video_url ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check the avatar video." };
  }
}

/** A timed caption for an uploaded screen recording. */

/**
 * Describe an uploaded screen recording from sampled keyframes: returns timed
 * captions narrating what is happening on screen.
 */
export async function describeScreenRecordingAction(
  frames: Array<{ timeSec: number; base64: string }>,
  durationSec: number,
  context: string,
  provider: LlmProvider = "gemini"
): Promise<{ captions: ScreenCaption[] } | { error: string }> {
  try {
    await requireOwner();
    if (!frames.length) return { error: "No frames were extracted from the video." };
    if (frames.length > 30) return { error: "Too many frames; sample the video more sparsely." };
    const parts: LlmPart[] = [
      {
        text: [
          "The images are keyframes sampled from a screen recording (software/computer usage), in order, with their timestamps in seconds:",
          frames.map((f, i) => `Frame ${i + 1}: t=${Math.round(f.timeSec)}s`).join("\n"),
          context.trim() ? `Context from the author: ${context.trim()}` : "",
          `The full video is ${Math.round(durationSec)} seconds long.`,
          'Write viewer captions that narrate what is happening on screen. Return ONLY a JSON array like [{"start": 0, "end": 6, "text": "..."}] - seconds as numbers, segments in order, covering 0 to the full duration with no gaps or overlaps, one segment per meaningful action (merge frames showing the same action), each text a single concise present-tense sentence under 14 words. No markdown, no code fences.',
        ].filter(Boolean).join("\n\n"),
      },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } },
      provider
    );
    if (!r.ok) return { error: "The model returned no captions. Try again." };
    const raw = parseLenientJsonArray(r.text) as Array<{ start?: number; end?: number; text?: string }> | null;
    if (!raw) return { error: "Could not parse captions from the model output. Try generating again." };
    const captions = raw
      .filter((c) => typeof c.start === "number" && typeof c.end === "number" && typeof c.text === "string" && c.text.trim())
      .map((c) => ({ start: Math.max(0, c.start as number), end: Math.min(durationSec, c.end as number), text: (c.text as string).trim() }))
      .filter((c) => c.end > c.start);
    if (!captions.length) return { error: "The model produced no usable captions." };
    return { captions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not describe the recording." };
  }
}

/**
 * Generate timed narration segments for a video: returns a script that an
 * instructor would speak over each part, synchronized to the video timeline.
 */
export async function generateVideoNarrationAction(
  frames: Array<{ timeSec: number; base64: string }>,
  durationSec: number,
  context: string,
  provider: LlmProvider = "gemini"
): Promise<{ segments: Array<{ start: number; end: number; text: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (!frames.length) return { error: "No frames were extracted from the video." };
    if (frames.length > 30) return { error: "Too many frames; sample the video more sparsely." };
    const parts: LlmPart[] = [
      {
        text: [
          "The images are keyframes sampled from a video (classroom recording, screen capture, or lecture footage), in order, with their timestamps in seconds:",
          frames.map((f, i) => `Frame ${i + 1}: t=${Math.round(f.timeSec)}s`).join("\n"),
          context.trim() ? `Context from the author: ${context.trim()}` : "",
          `The full video is ${Math.round(durationSec)} seconds long.`,
          'Write a spoken narration script for a voice-over of this video. Return ONLY a JSON array like [{"start": 0, "end": 12, "text": "..."}] - seconds as numbers, segments in order covering 0 to the full duration with no overlaps, each segment 5-25 seconds, each text 1-3 conversational first-person-plural sentences an instructor would SAY over that part of the video (not captions - flowing spoken narration that explains what is happening and why). No markdown, no code fences.',
        ].filter(Boolean).join("\n\n"),
      },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } },
      provider
    );
    if (!r.ok) return { error: "The model returned no narration. Try again." };
    const raw = parseLenientJsonArray(r.text) as Array<{ start?: number; end?: number; text?: string }> | null;
    if (!raw) return { error: "Could not parse narration from the model output. Try generating again." };
    const segments = raw
      .filter((s) => typeof s.start === "number" && typeof s.end === "number" && typeof s.text === "string" && s.text.trim())
      .map((s) => ({ start: Math.max(0, s.start as number), end: Math.min(durationSec, s.end as number), text: (s.text as string).trim() }))
      .filter((s) => s.end > s.start);
    if (!segments.length) return { error: "The model produced no usable narration segments." };
    return { segments };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate video narration." };
  }
}

export async function generateDeckFromTemplateAction(
  template: DeckTemplate,
  ctx: DeckGenContext,
  provider: LlmProvider
): Promise<GeneratedDeck | { error: string }> {
  try {
    await requireOwner();
    if (!template || !Array.isArray(template.slides) || template.slides.length === 0)
      return { error: "Add at least one slide to the template first." };
    return await generateDeckFromTemplate(template, ctx, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the deck." };
  }
}

const PRESENTATION_PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Render a generated deck to a real .pptx and store it in the Files library
 * (kind "file", tagged source "workflow"), so a workflow-generated presentation
 * appears in the Files menu in addition to its Drafts > Presentations draft.
 * Gradient themes fall back to a solid fill here (no browser canvas server-side);
 * the Drafts download renders the true gradient. */
export async function savePresentationFileAction(input: {
  presentationTitle: string;
  slides: PptxSlide[];
  theme?: DeckTheme | null;
  author?: string;
  workflowName?: string | null;
  workflowId?: string;
  workflowRunId?: string;
}): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    if (!Array.isArray(input.slides) || input.slides.length === 0) {
      return { error: "No slides to save." };
    }
    const theme: PptxTheme | undefined = input.theme
      ? {
          backgroundKind: input.theme.backgroundKind,
          backgroundColor: input.theme.backgroundColor,
          backgroundColor2: input.theme.backgroundColor2,
          fontColor: input.theme.fontColor,
        }
      : undefined;
    const title = (input.presentationTitle || "Presentation").trim() || "Presentation";
    const buf = await buildSlidesPptx({
      presentationTitle: title,
      slides: input.slides,
      author: input.author,
      theme,
    });
    const blob = new Blob([buf], { type: PRESENTATION_PPTX_MIME });
    const safeName = title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "Presentation";
    const file = await saveRecordingFile(supabase, user.id, blob, {
      name: `${safeName}.pptx`,
      kind: "file",
      mimeType: PRESENTATION_PPTX_MIME,
      durationSec: null,
      fileExt: "pptx",
      source: "workflow",
      origin: "unattended",
      workflowName: input.workflowName ?? null,
      workflowId: input.workflowId ?? null,
      workflowRunId: input.workflowRunId ?? null,
    });
    return { id: file.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the presentation file." };
  }
}

/** Save a generic file (docx, mp3, html, etc.) to the Files library via base64.
 * Mirrors savePresentationFileAction persistence: kind "file", source "workflow",
 * origin "unattended". Rejects base64 longer than 15MB. Returns file id on success
 * or error message. */
export async function saveLibraryFileAction(input: {
  name: string;
  base64: string;
  mimeType: string;
  fileExt: string;
  workflowId?: string;
  workflowName?: string;
  workflowRunId?: string;
}): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    if (input.base64.length > 15_000_000) {
      return { error: "The file is too large to save to the library." };
    }

    const buffer = Buffer.from(input.base64, 'base64');
    const blob = new Blob([buffer], { type: input.mimeType });
    const safeName = (input.name || "File").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "File";
    const ext = (input.fileExt || "").toLowerCase().replace(/^\./, "");

    const file = await saveRecordingFile(supabase, user.id, blob, {
      name: ext ? `${safeName}.${ext}` : safeName,
      kind: "file",
      mimeType: input.mimeType,
      durationSec: null,
      fileExt: ext,
      source: "workflow",
      origin: "unattended",
      workflowName: input.workflowName ?? null,
      workflowId: input.workflowId ?? null,
      workflowRunId: input.workflowRunId ?? null,
    });
    return { id: file.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file." };
  }
}
