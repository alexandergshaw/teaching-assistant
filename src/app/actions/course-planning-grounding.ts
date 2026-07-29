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
import { slideDeckJsonShape, slideStructureRequirements, enforceNoCodeForApplied } from "@/lib/slide-prompt";
import { courseKindContract, type CourseKind } from "@/lib/course-kind";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { scaffoldModuleIntroDoc, scaffoldAssignmentDoc } from "@/lib/embedded/docs";
import { callLlm, type LlmProvider, type Source } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { planWeekConcepts, buildConceptCycleInstruction } from "@/lib/lecture-concepts";
import {
  jsonObjectSlice,
  toSlideData,
  propagateExampleCodeToFollowups,
  generateModuleIntroForAssignment,
  generateAssignmentInstructionsForAssignment,
} from "./shared";
import {
  parseTocChapters,
  isNonContentWeekText,
  describeCoveredChapters,
  buildTocDerivationPrompt,
  type ParsedChapter,
} from "@/lib/workflows/source-alignment";

// The per-week slide-generation call plans MAX_CONCEPTS_PER_LECTURE
// (src/lib/lecture-concepts.ts) concepts, each with its own full cycle,
// plus post-lecture practice - not just one, which is what the old 12288
// cap was sized for. This single cap is shared by BOTH course kinds (the
// call site does not branch on courseKind), so it must cover whichever
// kind's worst case is larger - which, since the applied rewrite below,
// is the applied cycle, not the coding one.
//
// CODING worst case (unchanged - see src/lib/slide-prompt.ts's
// SLIDE_STRUCTURE_REQUIREMENTS): 4 bullets/slide, 3-6 sentence notes, code
// on cycle slides, ~3.6 chars/token (measured from a real generated deck):
//   slides(N) = 6 fixed (title, case study, post-lecture intro,
//     documentation, modern tech, references) + 9*N (5 cycle slides - a
//     concept slide plus Example/Walkthrough/Practice/Answer - + 4
//     post-lecture-practice slides per concept)
//   ~1300 chars/slide worst case (4 bullets ~800 + notes ~700 + code ~300,
//     diluted across slide types) / 3.6 chars-per-token
//   N=7 (MAX_CONCEPTS_PER_LECTURE) -> 69 slides -> ~26,000 tokens.
//
// APPLIED worst case (src/lib/slide-prompt.ts's APPLIED_STRUCTURE_
// REQUIREMENTS, rewritten around a six-slide cycle - Principle, In
// Practice, Artifact, Judgment Call, Your Turn, Model Response - plus two
// deck-level sections coding does not have, Failure Modes and
// Terminology): applied has NO code field at all (ever - see R3/entry 84
// in docs/REGRESSION.md), so nothing dilutes the per-slide estimate down;
// every cycle slide plausibly carries a full 4 bullets, not just a short
// caption the way a coding Example/Practice slide can:
//   slides(N) = 8 fixed (title, case study, failure modes, post-lecture
//     intro, documentation, terminology, modern tech, references) + 10*N
//     (6 cycle slides + 4 post-lecture-practice slides - 2 problems, each
//     with its own Model Response - per concept)
//   ~1500 chars/slide worst case (4 bullets ~800 + notes ~700, no code to
//     average down) / 3.6 chars-per-token
//   N=7 (MAX_CONCEPTS_PER_LECTURE) -> 78 slides -> ~32,500 tokens.
//
// The applied ceiling (~32,500) is already essentially AT the old 32768
// cap, leaving no real headroom. 49152 (three-quarters of gemini-3.1-
// flash-lite's documented 64K-token output limit) gives ~51% headroom over
// the new ~32,500-token applied worst case while still leaving 16,384
// tokens (25%) of the model's real output ceiling unused as pure buffer -
// the same "comfortable margin in both directions" the previous cap was
// chosen for, resized for the larger of the two course kinds it now has
// to cover. Never exceed the model's real 64K ceiling.
const SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS = 49152;

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
  allWeeks: ScheduleWeekPlan[] = [],
  courseKind: CourseKind = "coding"
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
    allWeeks,
    courseKind
  );

  // Degrade gracefully if slide generation fails
  const slidesFailed = "error" in slidesResult;
  if (slidesFailed) {
    console.error(`Slide generation failed for "Week ${weekNumber}": ${slidesResult.error}`);
  }
  const slides = slidesFailed ? [] : slidesResult.slides;
  // AC4: the real professional tool(s) this week's deck committed to (applied
  // courses only - see "moduleTools" in APPLIED_DECK_JSON_SHAPE). Carried
  // into the assignment-instructions call below so the deck and the
  // assignment stay about the SAME tool instead of drifting apart.
  const moduleTools = slidesFailed ? [] : slidesResult.moduleTools ?? [];
  // AC2: how many slides had "code"/"codeLanguage" stripped by the applied
  // no-code guard - 0/undefined for a coding course or a clean applied run.
  const codeViolations = slidesFailed ? 0 : slidesResult.codeViolations ?? 0;

  const assignmentName = `week-${String(weekNumber).padStart(2, "0")}`;

  // The intro and instructions are REAL generated documents whenever a model
  // is configured. They used to be scaffolded unconditionally - which shipped
  // placeholder prose, including a literal instructor TODO ("Add two or three
  // concrete examples..."), into student-facing lecture notes even when the
  // user had selected an LLM. The scaffold is now the embedded-provider path
  // and the degraded fallback, nothing more.
  //
  // The TOPIC is the display title, not the week label: passing "Week 1"
  // produced "This module introduces week 1 and why it matters", which says
  // nothing about the actual subject.
  const introTitle = topic || label;
  const introSource = [topic, summary].filter(Boolean).join("\n");

  let moduleIntroduction: string;
  let introFailed = false;
  if (provider === "embedded") {
    moduleIntroduction = scaffoldModuleIntroDoc(introTitle, summary);
  } else {
    const result = await generateModuleIntroForAssignment(
      assignmentName,
      introTitle,
      introSource,
      "",
      provider,
      courseKind
    );
    if ("error" in result) {
      console.error(`Module intro generation failed for "${label}": ${result.error}`);
      introFailed = true;
      moduleIntroduction = scaffoldModuleIntroDoc(introTitle, summary);
    } else {
      moduleIntroduction = result.text;
    }
  }

  let assignmentInstructions: string;
  let instructionsFailed = false;
  if (provider === "embedded") {
    assignmentInstructions = scaffoldAssignmentDoc(assignmentTitle, introSource);
  } else {
    const result = await generateAssignmentInstructionsForAssignment(
      assignmentName,
      assignmentTitle,
      introSource,
      "",
      provider,
      courseKind,
      // AC4: require the assignment's hands-on work to use the SAME tool(s)
      // the deck just committed to, so the two never drift onto different
      // tools. "" for a coding course (moduleTools is always []) or when the
      // deck failed to name any - the function treats a blank the same as
      // "no requirement", unchanged from before this parameter existed.
      moduleTools.length > 0 ? moduleTools.join("; ") : ""
    );
    if ("error" in result) {
      console.error(`Assignment instructions failed for "${label}": ${result.error}`);
      instructionsFailed = true;
      assignmentInstructions = scaffoldAssignmentDoc(assignmentTitle, introSource);
    } else {
      assignmentInstructions = result.text;
    }
  }

  return {
    assignmentName,
    introFailed: introFailed ? true : undefined,
    instructionsFailed: instructionsFailed ? true : undefined,
    slides,
    slidesFailed: slidesFailed ? true : undefined,
    // AC2: surfaced the same way slidesFailed/introFailed/instructionsFailed
    // are - a degraded run must be visible, not silently "clean".
    codeStrippedFromApplied: codeViolations > 0 ? codeViolations : undefined,
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
  allWeeks: ScheduleWeekPlan[] = [],
  courseKind: CourseKind = "coding"
): Promise<
  | {
      presentationTitle: string;
      slides: SlideData[];
      // AC4: the real professional tool(s) an applied deck committed to, one
      // entry per concept (see "moduleTools" in APPLIED_DECK_JSON_SHAPE).
      // Always [] for a coding deck - the coding JSON shape has no such field.
      moduleTools?: string[];
      // AC2: how many slides the no-code guard had to strip code from.
      codeViolations?: number;
    }
  | { error: string }
> {
  // Embedded Deterministic Engine
  if (provider === "embedded") {
    return scaffoldLessonPlan(topic, summary);
  }

  // Planning phase (Q1/Q2): derive this week's ordered concept list BEFORE
  // any slide is generated, sized to the lecture length, so breadth is a
  // deliberate decision rather than an emergent side effect of a vague
  // "cover this at maximum breadth" instruction. See
  // src/lib/lecture-concepts.ts for why a bare one-line topic ("Project
  // Integration and Initiation") degrades to more than one concept even
  // when the enumeration call itself fails.
  const conceptPlan = await planWeekConcepts(topic, summary, lectureDurationMinutes, provider);

  let prompt = `You are an expert educator creating a lecture slide deck for a course.

${courseKindContract(courseKind)}

The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

TOPIC: ${topic}

WEEK SUMMARY: ${summary}

COURSE DESCRIPTION: ${courseDescription}

LECTURE DURATION: ${lectureDurationMinutes} minutes

Based on the topic and summary above, create a complete lecture slide deck that teaches students the key concepts and skills for this week. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).`;

  prompt += buildConceptCycleInstruction(conceptPlan.concepts, courseKind);

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
${slideDeckJsonShape(courseKind)}

Requirements:
${slideStructureRequirements(courseKind)}`;

  let parsed: {
    presentationTitle?: string;
    slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string; notes?: string }>;
    moduleTools?: unknown;
  } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS },
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
        moduleTools?: unknown;
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

  // AC2: the applied no-code guard - defense in depth against exactly the
  // prompt regression that shipped Python to a no-code course twice.
  const guard = enforceNoCodeForApplied(slides, courseKind);
  if (guard.violations > 0) {
    console.error(
      `Applied no-code guard: stripped code from ${guard.violations} slide(s) for "${topic}" - the model returned code despite the applied contract forbidding it.`
    );
  }

  // AC4: the real tool(s) this deck committed to, one per concept.
  const moduleTools = Array.isArray(parsed.moduleTools)
    ? parsed.moduleTools.filter((t): t is string => typeof t === "string" && t.trim() !== "")
    : [];

  return {
    presentationTitle: parsed.presentationTitle ?? topic,
    slides: guard.slides,
    moduleTools,
    codeViolations: guard.violations,
  };
}
