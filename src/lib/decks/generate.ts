/**
 * Shared core for PowerPoint deck generation: LLM-powered or deterministic fallback.
 * Used by both the UI action and the workflow step (Chunk 5).
 * Pure, server-safe; no React dependencies.
 */

import { callLlm, type LlmProvider } from "@/lib/llm";
import { SLIDE_DECK_JSON_SHAPE } from "@/lib/slide-prompt";
import type { PptxSlide } from "@/lib/pptx";
import {
  DeckTemplate,
  ResolvedSlideSpec,
  getSlideRole,
  expandTemplate,
  type SlideRole,
} from "./types";

export interface DeckGenContext {
  subject: string;
  audience?: string;
  tone?: string;
  materials?: string;
  loopItems: Record<string, string[]>;
}

export interface GeneratedDeck {
  presentationTitle: string;
  slides: PptxSlide[];
}

/**
 * Map slide roles to title prefixes used by downstream code (e.g., propagateExampleCodeToFollowups).
 * Returns null for roles that derive their title from notes or role default.
 */
export function roleTitlePrefix(role: SlideRole): string | null {
  switch (role) {
    case "example":
      return "Example:";
    case "walkthrough":
      return "Walkthrough:";
    case "practice":
      return "Practice:";
    case "answer":
      return "Answer:";
    case "case-study":
      return "Case Study:";
    default:
      return null;
  }
}

/**
 * Build the LLM prompt describing each resolved slide and requesting JSON output.
 * Embeds SLIDE_DECK_JSON_SHAPE and quality rules.
 */
export function buildDeckPrompt(
  template: DeckTemplate,
  resolved: ResolvedSlideSpec[],
  ctx: DeckGenContext
): string {
  const slideDescriptions = resolved
    .map((spec, index) => {
      const prefix = roleTitlePrefix(spec.role);
      const titleGuidance = prefix ? `Title must begin with "${prefix}"` : "Title derived from role/notes";

      let description = `Slide ${index + 1} (${spec.role}): ${titleGuidance}.`;
      if (spec.notes) {
        description += ` Notes: ${spec.notes}`;
      }
      if (spec.loopItem) {
        description += ` Loop item: "${spec.loopItem}"`;
      }
      if (spec.includeCode) {
        description += ` Include code (${spec.codeLanguage || "python"}).`;
      }
      description += ` Max ${spec.maxBullets} bullets.`;
      return description;
    })
    .join("\n");

  return `You are an expert educator creating a lecture slide deck. Each slide must be fully self-contained: students reading them after class must understand every concept without verbal explanation from the instructor.

DECK SUBJECT: ${ctx.subject}
${ctx.audience ? `AUDIENCE: ${ctx.audience}\n` : ""}${ctx.tone ? `TONE: ${ctx.tone}\n` : ""}${ctx.materials ? `SOURCE MATERIALS:\n${ctx.materials}\n` : ""}
SLIDES TO CREATE:
${slideDescriptions}

Return ONLY valid JSON with exactly ${resolved.length} slides, in the exact order listed above:
${SLIDE_DECK_JSON_SHAPE}

Requirements:
- Produce EXACTLY the ${resolved.length} slides listed above, in that exact order and count. Do NOT add, remove, merge, or reorder slides, and do NOT insert a case study, extra practice, or closing slides unless they appear in the list.
- Each bullet must be a complete, self-contained sentence (or two) a student fully understands with no instructor present: define every term and state why it matters.
- Respect each slide's "Max N bullets". A slide marked "Max 0 bullets" MUST have an empty "bullets" array.
- Any slide whose title must begin with a prefix (Example:/Walkthrough:/Practice:/Answer:/Case Study:) MUST start with that exact prefix.
- For Example/Walkthrough/Practice/Answer slides, include "code" and "codeLanguage": the Walkthrough and Practice reuse the SAME code as their Example, the Practice must NOT reveal the solution, and the Answer gives the correct, runnable solution.
- Do not include any text outside the JSON object.`;
}

/**
 * Extract the first JSON object from text, handling optional ```json fence.
 */
function sliceJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/**
 * Normalize a parsed slide from the model into PptxSlide, respecting maxBullets.
 */
function toDeckSlide(
  raw: { title?: string; bullets?: string[]; code?: string; codeLanguage?: string },
  maxBullets: number
): PptxSlide {
  const slide: PptxSlide = {
    title: raw.title ?? "",
    bullets: (raw.bullets ?? []).slice(0, maxBullets),
  };
  if (typeof raw.code === "string" && raw.code.trim()) {
    slide.code = raw.code.replace(/\s+$/, "");
  }
  if (typeof raw.codeLanguage === "string" && raw.codeLanguage.trim()) {
    slide.codeLanguage = raw.codeLanguage.trim();
  }
  return slide;
}

/**
 * Propagate Example: code to following Walkthrough: and Practice: slides.
 * Example teaches with code, Walkthrough explains the code, Practice references it.
 */
function propagateExampleCode(slides: PptxSlide[]): PptxSlide[] {
  let exampleCode: string | undefined;
  let exampleLanguage: string | undefined;
  for (const slide of slides) {
    if (slide.title.startsWith("Example:")) {
      exampleCode = slide.code;
      exampleLanguage = slide.codeLanguage;
    } else if (
      (slide.title.startsWith("Walkthrough:") || slide.title.startsWith("Practice:")) &&
      exampleCode
    ) {
      slide.code = exampleCode;
      if (exampleLanguage) {
        slide.codeLanguage = exampleLanguage;
      }
    }
  }
  return slides;
}

/**
 * Deterministic fallback when provider === "embedded".
 * One slide per resolved spec, no LLM call.
 */
export function scaffoldDeck(
  template: DeckTemplate,
  resolved: ResolvedSlideSpec[],
  ctx: DeckGenContext
): GeneratedDeck {
  const slides = resolved.map((spec) => {
    const roleLabel = getSlideRole(spec.role)?.label || "Untitled";
    const prefix = roleTitlePrefix(spec.role) || "";
    const title = spec.title || `${prefix} ${spec.loopItem || roleLabel}`.trim();

    const bullets: string[] = [];
    if (spec.notes) {
      bullets.push(spec.notes.slice(0, 100));
    }
    if (spec.loopItem && !bullets.includes(spec.loopItem)) {
      bullets.push(spec.loopItem);
    }
    if (bullets.length === 0) {
      const roleDef = getSlideRole(spec.role);
      bullets.push(roleDef?.hint || "");
    }

    const slide: PptxSlide = {
      title,
      bullets: bullets.slice(0, spec.maxBullets),
    };

    if (spec.includeCode) {
      slide.code = `# ${spec.codeLanguage || "python"} example\npass`;
      slide.codeLanguage = spec.codeLanguage || "python";
    }

    return slide;
  });

  return {
    presentationTitle: template.name || ctx.subject,
    slides: propagateExampleCode(slides),
  };
}

/**
 * Generate a deck from a template using the provided LLM provider.
 * If provider === "embedded", returns a deterministic scaffold.
 * Otherwise calls the LLM with a 2-attempt guarded loop (jsonObjectSlice + JSON.parse).
 */
export async function generateDeckFromTemplate(
  template: DeckTemplate,
  ctx: DeckGenContext,
  provider: LlmProvider
): Promise<GeneratedDeck | { error: string }> {
  const resolved = expandTemplate(template, ctx.loopItems);

  if (provider === "embedded") {
    return scaffoldDeck(template, resolved, ctx);
  }

  const prompt = buildDeckPrompt(template, resolved, ctx);

  let parsed: {
    presentationTitle?: string;
    slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
  } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 12288, responseMimeType: "application/json" },
      },
      provider
    );

    if (!result.ok) {
      return { error: `LLM API error: HTTP ${result.status}` };
    }

    const jsonText = sliceJsonObject(result.text);
    if (!jsonText) {
      if (attempt === 1) {
        console.error("Slide JSON parse failed (attempt 1): no JSON object in response");
        continue;
      }
      return { error: "Could not parse slide data." };
    }

    try {
      parsed = JSON.parse(jsonText) as {
        presentationTitle?: string;
        slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
      };
      const anyUsable =
        Array.isArray(parsed.slides) &&
        parsed.slides.some((s) => typeof s.title === "string" && Array.isArray(s.bullets));
      if (!anyUsable && attempt === 1) {
        parsed = null;
        continue;
      }
      break;
    } catch (err) {
      if (attempt === 1) {
        console.error(
          `Slide JSON parse failed (attempt 1): ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
      return { error: "Could not parse slide data." };
    }
  }

  if (!parsed) {
    return { error: "Could not parse slide data." };
  }

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    return { error: "Model did not return a valid slides array." };
  }

  const mapped: PptxSlide[] = [];
  parsed.slides.forEach((s, idx) => {
    if (typeof s.title !== "string" || !Array.isArray(s.bullets)) return;
    const spec = resolved[idx];
    const maxBullets = spec ? spec.maxBullets : 4;
    mapped.push(toDeckSlide(s, maxBullets));
  });
  if (mapped.length === 0) {
    return { error: "The model returned no usable slides. Try generating again." };
  }
  const slides = propagateExampleCode(mapped);

  return {
    presentationTitle: parsed.presentationTitle ?? template.name ?? ctx.subject,
    slides,
  };
}
