"use server";

// Sibling of course-planning.ts (split out to keep that file under 1000
// lines): the web-search-grounded TOC-derivation helper used when a schedule
// or lecture-materials request's sourceMaterial names a source (a platform
// URL or a short citation) but pastes no table of contents - see
// shouldDeriveToc in src/lib/workflows/source-alignment.ts for the trigger.
// Also hosts buildScheduleWeekPlan/generateSlidesFromTopic, moved here for
// the same line-count reason - both are internal to
// generateLectureMaterialsFromScheduleAction, exported only for that.

import type { SlideData, AssignmentPlan, ScheduleWeekPlan } from "../actions-types";
import { SLIDE_DECK_JSON_SHAPE, SLIDE_STRUCTURE_REQUIREMENTS } from "@/lib/slide-prompt";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { scaffoldModuleIntroDoc, scaffoldAssignmentDoc } from "@/lib/embedded/docs";
import { callLlm, type LlmProvider, type Source } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { jsonObjectSlice, toSlideData, propagateExampleCodeToFollowups } from "./shared";
import {
  parseTocChapters,
  isNonContentWeekText,
  describeCoveredChapters,
  buildTocDerivationPrompt,
  type ParsedChapter,
} from "@/lib/workflows/source-alignment";

/**
 * A table of contents derived by web search for a source that has no pasted
 * TOC but looks identifiable (a URL or a short course citation) - see
 * shouldDeriveToc. Feeds the same aligned prompt branch a pasted TOC would.
 */
export interface DerivedToc {
  toc: string;
  chapters: ParsedChapter[];
  sources: Source[];
}

/**
 * Derive a table of contents for a course/source that was pasted as a bare
 * URL or short citation (e.g. a uCertify course link) rather than a table of
 * contents: one web-search-grounded LLM call asks for the source's official
 * published outline (course-outline pages, certification module lists, and
 * textbook TOCs are public web content even when the platform itself is
 * login-walled), then parses the response the same way a pasted TOC parses.
 *
 * Never throws and never returns a partial result: any failure (a transport
 * error, an empty response, or a response with no parseable chapters) simply
 * returns null so the caller falls back to today's name-only branch - a
 * search miss must never block schedule generation.
 */
export async function deriveTocFromSource(
  sourceMaterial: string,
  provider: LlmProvider = "gemini"
): Promise<DerivedToc | null> {
  try {
    await requireOwner();

    const trimmed = sourceMaterial.trim();
    if (!trimmed) return null;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: buildTocDerivationPrompt(trimmed) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        webSearch: true,
      },
      provider
    );

    if (!result.ok) return null;

    const chapters = parseTocChapters(result.text);
    if (chapters.length === 0) return null;

    const seenUris = new Set<string>();
    const sources: Source[] = [];
    for (const source of result.sources ?? []) {
      if (!seenUris.has(source.uri)) {
        seenUris.add(source.uri);
        sources.push(source);
      }
    }

    return { toc: result.text.trim(), chapters, sources };
  } catch {
    return null;
  }
}

/**
 * Generate a single week's materials (slides + intro + instructions) from the topic and course context.
 * Mirrors buildAssignmentPlan but operates on schedule week data instead of repo content.
 */
export async function buildScheduleWeekPlan(
  week: ScheduleWeekPlan,
  index: number,
  courseDescription: string,
  lectureDurationMinutes: number,
  provider: LlmProvider,
  context?: string,
  sourceMaterial?: string,
  allWeeks: ScheduleWeekPlan[] = []
): Promise<AssignmentPlan> {
  const weekNumber = week.week || index + 1;
  const label = `Week ${weekNumber}`;
  const topic = week.topic.trim();
  const summary = week.summary?.trim() || "";
  const assignmentTitle = week.assignmentTitle?.trim() || `Week ${weekNumber} Deliverable`;

  // Generate slides only (one LLM call per week cap)
  const slidesResult = await generateSlidesFromTopic(
    topic,
    summary,
    courseDescription,
    lectureDurationMinutes,
    provider,
    context,
    sourceMaterial,
    weekNumber,
    allWeeks
  );

  // Degrade gracefully if slide generation fails
  const slidesFailed = "error" in slidesResult;
  if (slidesFailed) {
    console.error(`Slide generation failed for "Week ${weekNumber}": ${slidesResult.error}`);
  }
  const slides = slidesFailed ? [] : slidesResult.slides;

  // Build intro and instructions deterministically
  const moduleIntroduction = scaffoldModuleIntroDoc(label, summary);
  const assignmentInstructions = scaffoldAssignmentDoc(assignmentTitle, `${topic}\n${summary}`);

  return {
    assignmentName: `week-${String(weekNumber).padStart(2, "0")}`,
    slides,
    slidesFailed: slidesFailed ? true : undefined,
    presentationTitle: topic || label,
    label,
    moduleIntroduction,
    assignmentInstructions,
    weekNumber,
    introTemplateHeadings: [],
    instructionsTemplateHeadings: [],
  } satisfies AssignmentPlan;
}

/**
 * Generate slides from a schedule week's topic and context.
 */
async function generateSlidesFromTopic(
  topic: string,
  summary: string,
  courseDescription: string,
  lectureDurationMinutes: number,
  provider: LlmProvider,
  context?: string,
  sourceMaterial?: string,
  weekNumber = 0,
  allWeeks: ScheduleWeekPlan[] = []
): Promise<{ presentationTitle: string; slides: SlideData[] } | { error: string }> {
  // Embedded Deterministic Engine
  if (provider === "embedded") {
    return scaffoldLessonPlan(topic, summary);
  }

  let prompt = `You are an expert educator creating a lecture slide deck for a course. The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

TOPIC: ${topic}

WEEK SUMMARY: ${summary}

COURSE DESCRIPTION: ${courseDescription}

LECTURE DURATION: ${lectureDurationMinutes} minutes

Based on the topic and summary above, create a complete lecture slide deck that teaches students the key concepts and skills for this week. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).`;

  if (sourceMaterial?.trim()) {
    // Same aligned/name-only test as the schedule prompt (parseTocChapters):
    // a real chapter list earns chapter/section references; a bare name (no
    // parseable TOC) is mentioned by name only.
    const aligned = parseTocChapters(sourceMaterial).length > 0;
    if (aligned) {
      prompt += `

Source material for this week:
${sourceMaterial.trim()}

Build this week's materials around the source sections named in the topic/summary above: reference chapter/section numbers where the source material above provides them, and assign readings from the source.`;
    } else {
      prompt += `

Primary source: ${sourceMaterial.trim()}

No table of contents was provided for this source, so mention it by name where it fits naturally - do not invent chapter or section numbers.`;
    }

    if (isNonContentWeekText(topic, summary)) {
      const covered = describeCoveredChapters(allWeeks, weekNumber || 0);
      prompt += `

This week's topic/summary marks it as a review, exam, or project week - it introduces no new chapter. Produce the matching artifact (a review guide, a practice set, or a project brief, whichever the topic/summary calls for), grounded in the chapters already covered so far${covered ? ` (${covered})` : ""}, not a fabricated new chapter's lecture.`;
    }
  }

  if (context?.trim()) {
    prompt += `

Additional instructor context (follow where applicable):
${context.trim()}`;
  }

  prompt += `

Return ONLY valid JSON:
${SLIDE_DECK_JSON_SHAPE}

Requirements:
${SLIDE_STRUCTURE_REQUIREMENTS}`;

  let parsed: {
    presentationTitle?: string;
    slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
  } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 12288 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `LLM API error for "${topic}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      if (attempt === 1) {
        console.error(`Slide JSON parse failed for "${topic}" (attempt 1): no JSON object in the response`);
        continue;
      }
      return { error: `Could not parse slide data for "${topic}".` };
    }

    try {
      parsed = JSON.parse(jsonText) as {
        presentationTitle?: string;
        slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
      };
      break;
    } catch (err) {
      if (attempt === 1) {
        console.error(
          `Slide JSON parse failed for "${topic}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
      return { error: `Could not parse slide data for "${topic}".` };
    }
  }

  if (!parsed) {
    return { error: `Could not parse slide data for "${topic}".` };
  }

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    return { error: `Model did not return a valid slides array for "${topic}".` };
  }

  let slides: SlideData[] = parsed.slides
    .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
    .map((s) => toSlideData(s, 4));

  slides = propagateExampleCodeToFollowups(slides);

  return {
    presentationTitle: parsed.presentationTitle ?? topic,
    slides,
  };
}
