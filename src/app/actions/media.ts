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
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import {
  checkLectureScriptMinutes,
  lectureScriptMaxOutputTokens,
  lectureScriptWordTarget,
} from "@/lib/lecture-script-bounds";
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
    // Budget the COMBINED wire size of every image, not each one alone -
    // several individually-fine images can still add up to a request body
    // Vercel's platform layer rejects before this function ever runs.
    const sizeCheck = checkWireBudget(sumBase64WireBytes(images.map((i) => i.base64)), "These images");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "These images are too large to upload in one request." };
    return { text: await extractTextbookInfoFromImages(images, provider) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the textbook image." };
  }
}

/**
 * Write a spoken-word lecture script for recording (teleprompter-ready).
 * Targets LECTURE_SCRIPT_WORDS_PER_MINUTE words per minute of the requested
 * duration.
 *
 * An out-of-range `targetMinutes` is an ERROR, not a substitution. This used
 * to silently fall back to 5 minutes, so the "generate-lecture-script"
 * workflow step's 50 produced a ~700-word script while its run form said
 * "Default 50" - see src/lib/lecture-script-bounds.ts for the full account.
 * The token budget likewise follows the requested length now, because a fixed
 * 4096 truncated anything past roughly 22 minutes.
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
    const checked = checkLectureScriptMinutes(targetMinutes);
    if (!checked.ok) return { error: checked.error };
    const minutes = checked.minutes;
    const words = lectureScriptWordTarget(minutes);
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
      {
        contents: [{ role: "user", parts }],
        // Sized to the REQUESTED length, not fixed at 4096 - see
        // lectureScriptMaxOutputTokens. A fixed 4096 truncated every script
        // past roughly 22 minutes, so an in-range request could still come
        // back short with nothing reporting it.
        generationConfig: { temperature: 0.6, maxOutputTokens: lectureScriptMaxOutputTokens(minutes) },
      },
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
    // Guards all six production callers of this action (Slide Studio deck
    // mode, file preview, and four workflow steps) - none of them capped the
    // request before this, and Vercel rejects an oversized body at the
    // platform layer before this function ever runs, so the check has to
    // live here to protect every caller at once.
    const sizeCheck = checkWireBudget(base64.length, "That PowerPoint");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "That PowerPoint is too large to upload in one request." };
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
    const sizeCheck = checkWireBudget(base64.length, "That Word document");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "That Word document is too large to upload in one request." };
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
    // The 30-frame cap above bounds COUNT, not size - 30 keyframes can still
    // add up to a request body Vercel's platform layer rejects before this
    // function ever runs, so budget their combined wire size too.
    const sizeCheck = checkWireBudget(sumBase64WireBytes(frames.map((f) => f.base64)), "These video frames");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "These video frames are too large to upload in one request." };
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
    const sizeCheck = checkWireBudget(sumBase64WireBytes(frames.map((f) => f.base64)), "These video frames");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "These video frames are too large to upload in one request." };
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
