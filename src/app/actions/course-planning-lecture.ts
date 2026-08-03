"use server";

import type { SlideData } from "../actions-types";
import { slideStructureRequirements, slideDeckJsonShapeWith, enforceNoCodeForApplied } from "@/lib/slide-prompt";
import { enforceGraphicsForApplied } from "@/lib/slide-graphics";
import { fillMissingGraphics } from "./slide-graphics-repair";
import { courseKindContract, type CourseKind } from "@/lib/course-kind";
import { parseQaExamples, type QaExample } from "@/lib/lecture-qa";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { extractTextFromBuffer } from "@/lib/office-extract";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { jsonObjectSlice, toSlideData, propagateExampleCodeToFollowups } from "./shared";

// ── Lecture generation (materials -> deck, materials -> Q&A) ────────────────
// Split out of course-planning.ts (which was pushing the 1000-line cap) with
// no behaviour change - every export below keeps its exact name, signature,
// and semantics from before the split.

/** Generate a lecture deck with slides and announcement from course materials. */
export async function generateLectureFromMaterialsAction(
  courseName: string,
  moduleName: string,
  materialsText: string,
  provider: LlmProvider = "gemini",
  // Whether this is a programming course. Defaults to "coding" so every
  // pre-existing caller (there was exactly one - the "prepare-lecture"
  // workflow step, which had no courseKind input at all until this fix)
  // behaves exactly as before; the step now resolves and passes a real kind.
  courseKind: CourseKind = "coding"
): Promise<
  | {
      presentationTitle: string;
      slides: SlideData[];
      announcement: string;
      // AC2: how many slides the no-code guard stripped code from - see
      // enforceNoCodeForApplied. Always undefined for a coding course or a
      // clean applied run.
      codeStripped?: number;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    const truncated = materialsText.slice(0, 24000);

    // Embedded Deterministic Engine: template a deck outline from the
    // materials (scaffoldLessonPlan never errors), with a plain announcement
    // derived from the slide titles.
    if (provider === "embedded") {
      const scaffold = await scaffoldLessonPlan(truncated);
      const announcement =
        "This lecture covers: " +
        scaffold.slides.map((s) => s.title).join("; ") +
        ". Review the slides and bring questions to class.";
      return {
        presentationTitle: scaffold.presentationTitle,
        slides: scaffold.slides,
        announcement,
      };
    }

    const prompt = `You are an expert lecturer preparing course materials. Given the following module materials, produce a complete lecture presentation with slides and an announcement for students. The slides must be fully self-contained - students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

${courseKindContract(courseKind)}

MODULE: ${moduleName}
COURSE: ${courseName}

MATERIALS:
${truncated}

Cover every concept the materials introduce; the structure requirements below determine the slide count.

Return ONLY valid JSON matching this structure, plus an "announcement" field:
${slideDeckJsonShapeWith('"announcement": "2-3 short paragraphs of plain text summarizing the lecture for students"', courseKind)}

Requirements:
${slideStructureRequirements(courseKind)}

Announcement requirements:
- 2-3 short paragraphs of plain text (no HTML or markdown).
- Summarize the key topics and learning objectives.
- Invite questions and next steps.`;

    let parsed: {
      presentationTitle?: string;
      slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
      announcement?: string;
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
        return {
          error: `LLM API error for "${moduleName}": HTTP ${result.status} — ${result.body.slice(0, 200)}`,
        };
      }

      const jsonText = jsonObjectSlice(result.text);
      if (!jsonText) {
        if (attempt === 1) {
          console.error(`Lecture JSON parse failed for "${moduleName}" (attempt 1): no JSON object in the response`);
          continue;
        }
        return { error: `Could not parse the lecture from the model output. Try again.` };
      }

      try {
        parsed = JSON.parse(jsonText) as {
          presentationTitle?: string;
          slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
          announcement?: string;
        };
        break;
      } catch (err) {
        if (attempt === 1) {
          console.error(
            `Lecture JSON parse failed for "${moduleName}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
        return { error: `Could not parse the lecture from the model output. Try again.` };
      }
    }

    if (!parsed) {
      return { error: `Could not parse the lecture from the model output. Try again.` };
    }

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return { error: `Model did not return a valid slides array for "${moduleName}".` };
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
        `Applied no-code guard: stripped code from ${guard.violations} slide(s) for "${moduleName}" - the model returned code despite the applied contract forbidding it.`
      );
    }

    // P3-AC1/AC2/AC3: the graphics data-layer guard, mirroring the no-code
    // guard above - detect required-but-missing graphics (Artifact:/
    // Judgment Call:/Agenda:), repair with one targeted call.
    //
    // AC2 (graphics-gap-reporting hand-off): this used to also return the
    // residual count as `graphicsMissing`, but no caller ever read it (the
    // only reader was this file's own console.error below). Deleted rather
    // than wired up as a returned field: this action's one caller
    // (steps.content-lectures.prepare.ts's "prepare-lecture" step) now
    // recomputes the SAME check directly over `r.slides` once generation
    // returns, the identical choke-point pattern AC1 established for
    // assembleLectureFiles - a pure recomputation, not a second count to
    // keep in sync with this one.
    let finalSlides = guard.slides;
    const graphicCheck = enforceGraphicsForApplied(finalSlides, courseKind);
    if (graphicCheck.missing.length > 0) {
      finalSlides = await fillMissingGraphics(finalSlides, graphicCheck.missing, provider);
      const recheck = enforceGraphicsForApplied(finalSlides, courseKind);
      if (recheck.missing.length > 0) {
        console.error(
          `Applied graphics guard: ${recheck.missing.length} slide(s) still missing a required graphic for "${moduleName}" after the repair pass - ${recheck.missing
            .map((g) => g.title)
            .join("; ")}.`
        );
      }
    }

    return {
      presentationTitle: parsed.presentationTitle ?? `${moduleName} Lecture`,
      slides: finalSlides,
      announcement: parsed.announcement ?? "",
      codeStripped: guard.violations > 0 ? guard.violations : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the lecture." };
  }
}

/**
 * Anticipate the questions students are likely to ask during a lecture and
 * draft instructor-ready answers. Module materials arrive as gathered text;
 * optional slide uploads arrive base64 and are text-extracted server-side.
 *
 * For a "coding" course, the same call also asks the model for 2-3 complete,
 * runnable example programs relevant to the module - "examples" in the
 * returned JSON is parsed defensively (parseQaExamples) and clamped to 3, and
 * degrades to [] rather than ever failing the run. An "applied" (no-code)
 * course never requests or returns examples, regardless of what the model
 * sends back - the questions are the primary deliverable either way.
 */
export async function generateLectureQaAction(
  courseName: string,
  moduleName: string,
  materialsText: string,
  slideFiles: Array<{ name: string; base64: string }>,
  provider: LlmProvider = "gemini",
  // Whether this is a programming course. Defaults to "coding" so every
  // existing caller is unchanged.
  courseKind: CourseKind = "coding"
): Promise<
  | {
      questions: Array<{ question: string; answer: string }>;
      examples?: QaExample[];
    }
  | { error: string }
> {
  try {
    await requireOwner();

    let slidesText = "";
    for (const file of slideFiles.slice(0, 3)) {
      try {
        const text = await extractTextFromBuffer(file.name, Buffer.from(file.base64, "base64"));
        if (text && text.trim()) {
          slidesText += `\n# Slides: ${file.name}\n${text.trim()}\n`;
        }
      } catch (err) {
        console.error(
          `Slide text extraction failed for "${file.name}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const materials = materialsText.slice(0, 20000);
    const slides = slidesText.slice(0, 16000);

    // Embedded Deterministic Engine: template questions from the material
    // headings so the step never errors without an LLM provider. Falls back
    // to sentence/phrase fragments when the text has no heading-sized lines
    // (e.g. a tile's topics field pasted as one long paragraph).
    if (provider === "embedded") {
      const combined = materials + "\n" + slides;
      let topics = [
        ...new Set(
          combined
            .split("\n")
            .map((l) => l.replace(/^#+\s*/, "").trim())
            .filter((l) => l.length > 3 && l.length < 80)
        ),
      ];
      if (topics.length === 0) {
        topics = [
          ...new Set(
            combined
              .split(/[.;,\n]+/)
              .map((l) => l.trim())
              .filter((l) => l.length > 3 && l.length < 80)
          ),
        ];
      }
      const questions = topics.slice(0, 10).map((topic) => ({
        question: `Can you walk through "${topic}" one more time with an example?`,
        answer: `Revisit the ${topic} material step by step, work one concrete example on the board, and point students to the matching module resource for practice.`,
      }));
      if (questions.length === 0) {
        return { error: "Not enough material to anticipate questions. Add module materials or slides." };
      }
      return { questions };
    }

    // Only a coding course is asked for example programs; the prompt for an
    // applied (no-code) course never mentions code at all, and the JSON
    // shape it is given has no "examples" field to fill in.
    const examplesRequirement =
      courseKind === "coding"
        ? `\n- Also provide 2-3 example programs directly relevant to this module's material. Each example must be a COMPLETE, RUNNABLE program (not a fragment), written in the language this module actually teaches. For each, write a 2-4 sentence explanation of what it demonstrates and what to point out when showing it to the class.`
        : "";
    const jsonShape =
      courseKind === "coding"
        ? `{ "questions": [ { "question": "...", "answer": "..." } ], "examples": [ { "title": "...", "language": "...", "code": "...", "explanation": "..." } ] }`
        : `{ "questions": [ { "question": "string", "answer": "string" } ] }`;

    const prompt = `You are an experienced instructor preparing for a lecture. Based on the module materials${slides ? " and the actual lecture slides" : ""} below, anticipate the questions students are most likely to ask DURING this lecture, and write a clear, instructor-ready answer for each.

${courseKindContract(courseKind)}

COURSE: ${courseName}
MODULE: ${moduleName}

MATERIALS:
${materials}
${slides ? `\nLECTURE SLIDES:\n${slides}\n` : ""}
Requirements:
- 10 to 16 questions, phrased the way a student would actually ask them (confusions, edge cases, "why does...", "what happens if...", practical concerns like grading or tooling).
- Order them roughly in the order the topics come up in the lecture.
- Each answer is 2-5 sentences, concrete and self-contained, written so the instructor can deliver it verbatim.
- Include at least one question about how the topic connects to the assignment or assessment when the materials mention one.${examplesRequirement}

Return ONLY valid JSON matching this structure:
${jsonShape}`;

    let parsed: {
      questions?: Array<{ question?: string; answer?: string }>;
      examples?: unknown;
    } | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
        },
        provider
      );

      if (!result.ok) {
        return {
          error: `LLM API error for "${moduleName}": HTTP ${result.status} — ${result.body.slice(0, 200)}`,
        };
      }

      const jsonText = jsonObjectSlice(result.text);
      if (!jsonText) {
        if (attempt === 1) {
          console.error(`Lecture Q&A JSON parse failed for "${moduleName}" (attempt 1): no JSON object in the response`);
          continue;
        }
        return { error: "Could not parse the Q&A from the model output. Try again." };
      }

      try {
        parsed = JSON.parse(jsonText) as {
          questions?: Array<{ question?: string; answer?: string }>;
          examples?: unknown;
        };
        break;
      } catch (err) {
        if (attempt === 1) {
          console.error(
            `Lecture Q&A JSON parse failed for "${moduleName}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
        return { error: "Could not parse the Q&A from the model output. Try again." };
      }
    }

    if (!parsed || !Array.isArray(parsed.questions)) {
      return { error: `Model did not return a valid questions array for "${moduleName}".` };
    }

    const questions = parsed.questions
      .filter(
        (q): q is { question: string; answer: string } =>
          typeof q.question === "string" &&
          q.question.trim() !== "" &&
          typeof q.answer === "string" &&
          q.answer.trim() !== ""
      )
      .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() }));

    // Only a coding course's examples are ever parsed and returned - an
    // applied course carries no examples regardless of what the model sent
    // back, so a no-code course can never leak code through this step.
    const examples = courseKind === "coding" ? parseQaExamples(parsed.examples) : [];

    return { questions, examples };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the lecture Q&A." };
  }
}
