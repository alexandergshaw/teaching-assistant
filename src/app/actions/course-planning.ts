"use server";

import type { SlideData, CourseScheduleRow, CourseScheduleResult, AssignmentPlan, ScheduleWeekPlan } from "../actions-types";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { SLIDE_DECK_JSON_SHAPE, SLIDE_STRUCTURE_REQUIREMENTS, slideDeckJsonShapeWith } from "@/lib/slide-prompt";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { scaffoldModuleIntroDoc, scaffoldAssignmentDoc } from "@/lib/embedded/docs";
import { scaffoldCourseSchedule } from "@/lib/embedded/schedule";
import { extractTextFromBuffer } from "@/lib/office-extract";
import { callLlm, type LlmProvider, type Source } from "@/lib/llm";
import { courseEngineSchedule, courseEngineLecture, courseEngineMaterials, type CourseEngineFile, type CourseEngineUploadFile, type CourseEngineHomework, type ScheduleResponse } from "@/lib/course-engine";
import { requireOwner } from "@/lib/supabase/auth";
import { extractJsonObject, jsonObjectSlice, mapWithConcurrency, toSlideData, propagateExampleCodeToFollowups } from "./shared";
import { parseTocChapters, isNonContentWeekText, describeCoveredChapters, shouldDeriveToc } from "@/lib/workflows/source-alignment";
import { deriveTocFromSource } from "./course-planning-grounding";


/** Generate a lecture deck with slides and announcement from course materials. */
export async function generateLectureFromMaterialsAction(
  courseName: string,
  moduleName: string,
  materialsText: string,
  provider: LlmProvider = "gemini"
): Promise<
  | { presentationTitle: string; slides: SlideData[]; announcement: string }
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

MODULE: ${moduleName}
COURSE: ${courseName}

MATERIALS:
${truncated}

Cover every concept the materials introduce; the structure requirements below determine the slide count.

Return ONLY valid JSON matching this structure, plus an "announcement" field:
${slideDeckJsonShapeWith('"announcement": "2-3 short paragraphs of plain text summarizing the lecture for students"')}

Requirements:
${SLIDE_STRUCTURE_REQUIREMENTS}

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

    return {
      presentationTitle: parsed.presentationTitle ?? `${moduleName} Lecture`,
      slides,
      announcement: parsed.announcement ?? "",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the lecture." };
  }
}

/**
 * Anticipate the questions students are likely to ask during a lecture and
 * draft instructor-ready answers. Module materials arrive as gathered text;
 * optional slide uploads arrive base64 and are text-extracted server-side.
 */
export async function generateLectureQaAction(
  courseName: string,
  moduleName: string,
  materialsText: string,
  slideFiles: Array<{ name: string; base64: string }>,
  provider: LlmProvider = "gemini"
): Promise<{ questions: Array<{ question: string; answer: string }> } | { error: string }> {
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

    const prompt = `You are an experienced instructor preparing for a lecture. Based on the module materials${slides ? " and the actual lecture slides" : ""} below, anticipate the questions students are most likely to ask DURING this lecture, and write a clear, instructor-ready answer for each.

COURSE: ${courseName}
MODULE: ${moduleName}

MATERIALS:
${materials}
${slides ? `\nLECTURE SLIDES:\n${slides}\n` : ""}
Requirements:
- 10 to 16 questions, phrased the way a student would actually ask them (confusions, edge cases, "why does...", "what happens if...", practical concerns like grading or tooling).
- Order them roughly in the order the topics come up in the lecture.
- Each answer is 2-5 sentences, concrete and self-contained, written so the instructor can deliver it verbatim.
- Include at least one question about how the topic connects to the assignment or assessment when the materials mention one.

Return ONLY valid JSON matching this structure:
{ "questions": [ { "question": "string", "answer": "string" } ] }`;

    let parsed: { questions?: Array<{ question?: string; answer?: string }> } | null = null;

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
        parsed = JSON.parse(jsonText) as { questions?: Array<{ question?: string; answer?: string }> };
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

    return { questions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the lecture Q&A." };
  }
}


// Format the Monday–Friday range for week N (1-based) starting from an ISO
// date (YYYY-MM-DD), e.g. "Aug 25 – Aug 29". Used when the Course Engine
// schedule endpoint supplies topics but no calendar dates (Gemini does both).
function weekDateRange(startISO: string, weekNumber: number): string {
  if (!startISO) return "";
  const start = new Date(`${startISO}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "";

  // Snap to the Monday of the start week, then advance to the requested week.
  const day = start.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(start);
  monday.setDate(start.getDate() + mondayOffset + (weekNumber - 1) * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(friday)}`;
}

// Adapt the Course Engine schedule response to the CourseScheduleRow shape the
// UI already renders. The endpoint provides per-week topics + citations but no
// dates or per-week assignments, so dates are derived locally and assignment is
// left blank.
function scheduleResponseToRows(
  resp: ScheduleResponse,
  startingDate: string
): CourseScheduleRow[] {
  return (resp.weeks ?? []).map((w) => ({
    week: w.week,
    dates: weekDateRange(startingDate, w.week),
    topics: (w.topics ?? []).join(", "),
    assignment: "",
  }));
}

export async function generateCourseScheduleAction(
  courseDescription: string,
  term: string,
  startingDate: string,
  numberOfWeeks: number | null,
  numberOfTests: number | null,
  provider: LlmProvider = "gemini"
): Promise<CourseScheduleResult | { error: string }> {
  try {
    const topicsOnly = !term.trim() && !startingDate && numberOfWeeks === null && numberOfTests === null;

    if (topicsOnly) {
      if (provider === "other") {
        const resp = await courseEngineSchedule(courseDescription.trim(), 15);
        const rows = scheduleResponseToRows(resp, "");
        const topics = rows.flatMap((r) => r.topics.split(", ")).filter(Boolean);
        return { rows: [], topics };
      }

      if (provider === "embedded") {
        const rows = scaffoldCourseSchedule(courseDescription, "", 15, 0);
        const topics = rows.flatMap((r) => r.topics.split(", ")).filter(Boolean);
        return { rows: [], topics };
      }

      const prompt = `You are an expert curriculum designer. Given this course description, return ONLY a JSON array of strings — the ordered list of topics the course should cover, one concise topic per entry (8–30 topics depending on scope). No numbering in the strings, no markdown.

COURSE DESCRIPTION:
${courseDescription}

Return ONLY valid JSON in this exact format:
["Topic 1", "Topic 2", "Topic 3", ...]`;

      const parts: Array<{ text: string }> = [
        { text: prompt },
      ];

      const llmResult = await callLlm(
        {
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        },
        provider
      );

      if (!llmResult.ok) {
        return { error: `Topics generation failed: HTTP ${llmResult.status} — ${llmResult.body.slice(0, 200)}` };
      }

      const parsed = parseLenientJsonArray(llmResult.text);
      if (!parsed) {
        return { error: "Could not parse topics from the model response." };
      }

      const topics = parsed
        .filter((t) => typeof t === "string")
        .map((t) => (t as string).trim())
        .filter(Boolean);

      if (topics.length === 0) {
        return { error: "The model produced no usable topics." };
      }

      return { rows: [], topics };
    }

    const weeks = numberOfWeeks ?? 15;
    const tests = numberOfTests ?? 0;
    const useToday = !startingDate;
    const dateForSchedule = useToday ? new Date().toISOString().split("T")[0] : startingDate;

    if (provider === "other") {
      const resp = await courseEngineSchedule(courseDescription.trim(), weeks);
      let rows = scheduleResponseToRows(resp, dateForSchedule);
      if (useToday) {
        rows = rows.map((r) => ({ ...r, dates: "" }));
      }
      return { rows };
    }

    if (provider === "embedded") {
      let rows = scaffoldCourseSchedule(courseDescription, dateForSchedule, weeks, tests);
      if (useToday) {
        rows = rows.map((r) => ({ ...r, dates: "" }));
      }
      return { rows };
    }

    const termLine = term.trim() ? `\nTERM: ${term}` : "";
    const dateInstruction = startingDate
      ? `COURSE START DATE: ${startingDate}`
      : "No start date was provided - use week numbers only and leave the dates field an empty string";

    const prompt = `You are an expert curriculum designer creating a weekly course schedule.

COURSE DESCRIPTION:
${courseDescription}${termLine}
${dateInstruction}
NUMBER OF WEEKS: ${weeks}
NUMBER OF TESTS: ${tests}

Generate a complete ${weeks}-week course schedule. Distribute ${tests} test(s) logically across the schedule (e.g. after major topic blocks).${startingDate ? ` Calculate actual date ranges for each week starting from the provided start date (Monday–Friday format, e.g. "Aug 25 – Aug 29").` : ""} Every week should have instructional content — do not include break weeks or non-instruction weeks.

Return ONLY valid JSON in this exact format:
{
  "rows": [
    { "week": 1, "dates": "...", "topics": "...", "assignment": "..." },
    ...
  ]
}

Requirements:
- Include exactly ${weeks} rows (one per week).
- "week" is the week number (1-based integer).
- "dates" is the date range for that week (e.g. "Aug 25 – Aug 29")${startingDate ? "." : " or empty string if no start date was provided."}"
- "topics" describes the main subject(s) covered that week; for test weeks include "Test${tests > 1 ? " N" : ""}" alongside the topic.
- "assignment" is a brief description of the homework or activity due that week; write "Test" for test weeks.
- Space the ${tests} test(s) evenly across the schedule, placing them at the end of major topic blocks.
- Each test week must be immediately preceded by a review week (e.g. "Review" or "Review: [topic]").
- No new topics are introduced in review weeks or test weeks; these weeks consolidate previously covered material.
- Do not include any text outside the JSON object.`;

    const parts: Array<{ text: string }> = [
      { text: prompt },
    ];

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Schedule generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse the schedule from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      rows?: Array<{ week?: unknown; dates?: unknown; topics?: unknown; assignment?: unknown }>;
    };

    if (!parsed.rows || !Array.isArray(parsed.rows)) {
      return { error: "Model did not return a valid schedule." };
    }

    const rows: CourseScheduleRow[] = parsed.rows
      .filter((r) => typeof r.week === "number" || typeof r.week === "string")
      .map((r) => ({
        week: typeof r.week === "number" ? r.week : parseInt(String(r.week), 10),
        dates: typeof r.dates === "string" ? r.dates : "",
        topics: typeof r.topics === "string" ? r.topics : "",
        assignment: typeof r.assignment === "string" ? r.assignment : "",
      }));

    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}



// ── Course Engine binary endpoints ──────────────────────────────────────────
// These wrap the Course Engine API's file-returning endpoints. They are invoked
// only when the provider toggle is set to "other"; the result is a base64 file
// the client downloads directly (no in-app editable preview).

export async function generateLectureDeckAction(
  objectives: string,
  title?: string,
  file?: CourseEngineUploadFile,
  homework?: CourseEngineHomework
): Promise<CourseEngineFile | { error: string }> {
  try {
    return await courseEngineLecture(objectives, title, file, homework);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lecture generation failed." };
  }
}

export async function generateCourseMaterialsAction(
  zipBase64: string
): Promise<(CourseEngineFile & { rubricCsv: string | null }) | { error: string }> {
  try {
    const materials = await courseEngineMaterials(zipBase64);

    // The materials package already contains the deterministic rubric.csv, so
    // pull it out here and hand it back with the file — that lets the UI show
    // the rubric from this single call instead of re-hitting /materials.
    let rubricCsv: string | null = null;
    try {
      const JSZip = (await import("jszip")).default;
      const out = await JSZip.loadAsync(Buffer.from(materials.base64, "base64"));
      const rubricFile =
        out.file("rubric.csv") ??
        out.file(Object.keys(out.files).find((p) => /(^|\/)rubric\.csv$/i.test(p)) ?? "");
      if (rubricFile) {
        const csv = (await rubricFile.async("string")).trim();
        rubricCsv = csv || null;
      }
    } catch {
      // Rubric extraction is best-effort; the package download still succeeds.
    }

    return { ...materials, rubricCsv };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Materials generation failed." };
  }
}

/** Read a repo's latest GitHub Actions run (CI signal for the grading view). */

// ── Course schedule generation ──────────────────────────────────────────────────

/** Represents a single week in a course schedule with topic, assignments, and tests. */

// Shared between the pasted-TOC and derived-TOC aligned branches so the
// balancing policy text is identical either way (see generateSchedulePlanAction).
const CHAPTER_ALIGNMENT_POLICY = `Align the weekly plan to this source's chapters/modules in order (week N covers chapter(s) X), and name the covered chapter(s) in each week's summary (e.g., "Chapter 3: Functions" or "Chapters 2-4: Foundations"). Apply this balancing policy:
- Fewer chapters than weeks: allocate the extra weeks to the densest chapters (judged from the subsection counts shown in the source material above), splitting a dense chapter into "Chapter N - Part I" and "Chapter N - Part II", and insert standard non-content weeks (a mid-term review and exam near the midpoint; a project and/or final-review and final week near the end) as needed to fill out the term.
- More chapters than weeks: group adjacent related chapters into shared weeks (e.g., "Chapters 4-5: ...") - never drop a chapter.
- Never invent source content: every week's summary names exactly what it covers (e.g., "Chapter 7: ...", "Review - Chapters 1-6", "Final project week").
- The instructor context below overrides these rules where it speaks (e.g. "no exam weeks" removes the exam week even where this policy would otherwise add one).`;

/**
 * Generate a course schedule from a high-level description, distributing assignments and tests evenly.
 * Returns a courseTitle and the structured week plan used by workflows (assignment slugs + test
 * flags), unlike generateCourseScheduleAction, which produces display rows for the syllabus.
 */
export async function generateSchedulePlanAction(
  courseDescription: string,
  weeks: number,
  tests: number,
  provider: LlmProvider = "gemini",
  context?: string,
  sourceMaterial?: string
): Promise<
  | { courseTitle: string; schedule: ScheduleWeekPlan[]; derivedToc?: string; derivedSources?: Source[] }
  | { error: string }
> {
  try {
    await requireOwner();

    // Validate inputs
    if (!courseDescription.trim()) return { error: "Enter a course description." };
    const weekCount = Number(weeks);
    if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) {
      return { error: "Enter a number of weeks between 1 and 52." };
    }
    const testCount = Number(tests);
    if (!Number.isInteger(testCount) || testCount < 0 || testCount > weekCount) {
      return { error: "The number of tests must be between 0 and the number of weeks." };
    }

    // Call LLM to generate schedule
    let prompt = `You are an expert curriculum designer. Given a course description, produce a JSON object ONLY (no markdown fences) with:
- "courseTitle": a clear, concise title for the course
- "weeks": an array with exactly ${weekCount} week objects, each with:
  - "week": 1-based week number
  - "topic": short topic name
  - "summary": 1-2 sentence description
  - "assignmentTitle": string or null (null only for test weeks)
  - "assignmentSlug": kebab-case slug like "week-01-variables" or null
  - "testName": string like "Test 1" or null

Distribute exactly ${testCount} tests evenly across the term (final test in week ${weekCount} if tests > 0).
Every non-test week must have an assignment reinforcing the week's topic.
Topics should progress from foundational to advanced.

Course description:
${courseDescription}`;

    let derivedToc: string | undefined;
    let derivedSources: Source[] | undefined;

    if (sourceMaterial?.trim()) {
      // "Aligned" means the source material parses as a real chapter/module
      // list (see parseTocChapters); the same test drives the post-generation
      // balance check in the generate-schedule step. When it does not parse
      // (e.g. a bare textbook citation used as a fallback source), the schedule
      // still names the source, but weaker: no attempt at chapter alignment -
      // UNLESS the text looks like a course identifier (shouldDeriveToc: a
      // URL or a short citation), in which case one web-search-grounded call
      // (deriveTocFromSource) tries to find the source's real published table
      // of contents first; a miss falls back to the same name-only branch.
      const pastedChapters = parseTocChapters(sourceMaterial);
      if (pastedChapters.length > 0) {
        prompt += `

Source material alignment:
${sourceMaterial.trim()}

${CHAPTER_ALIGNMENT_POLICY}`;
      } else {
        const derivation = shouldDeriveToc(sourceMaterial)
          ? await deriveTocFromSource(sourceMaterial, provider)
          : null;

        if (derivation) {
          derivedToc = derivation.toc;
          derivedSources = derivation.sources;
          prompt += `

Primary source: ${sourceMaterial.trim()}

Source material alignment (the official table of contents, found via web search):
${derivation.toc}

${CHAPTER_ALIGNMENT_POLICY}`;
        } else {
          prompt += `

Primary source: ${sourceMaterial.trim()}

No table of contents was provided for this source, so mention it by name in weeks where it fits naturally - do not attempt chapter-by-chapter alignment or invent a chapter structure.`;
        }
      }
    }

    if (context?.trim()) {
      prompt += `

Additional instructor context (follow where applicable):
${context.trim()}`;
    }

    const r = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!r.ok) return { error: "The model returned no schedule." };

    const parsed = extractJsonObject(r.text);
    if (!parsed || typeof parsed !== "object") {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    // Extract and validate weeks array
    const weeksArray = parsed.weeks;
    if (!Array.isArray(weeksArray)) {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    if (weeksArray.length < weekCount) {
      return { error: "The model returned the wrong number of weeks. Try again." };
    }

    // Trim to exact count if extras exist
    const schedule: ScheduleWeekPlan[] = weeksArray.slice(0, weekCount).map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        return {
          week: 0,
          topic: "",
          summary: "",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        };
      }
      const e = entry as Record<string, unknown>;
      return {
        week: Number(e.week) || 0,
        topic: typeof e.topic === "string" ? e.topic.trim() : "",
        summary: typeof e.summary === "string" ? e.summary.trim() : "",
        assignmentTitle: typeof e.assignmentTitle === "string" ? e.assignmentTitle.trim() : null,
        assignmentSlug: typeof e.assignmentSlug === "string" ? e.assignmentSlug.trim() : null,
        testName: typeof e.testName === "string" ? e.testName.trim() : null,
      };
    });

    // Derive courseTitle with fallback
    let courseTitle = "";
    if (typeof parsed.courseTitle === "string") {
      courseTitle = parsed.courseTitle.trim();
    }
    if (!courseTitle) {
      // Fallback: first sentence of description, trimmed to 80 chars
      const firstSentence = courseDescription.trim().split(/[.!?]/)[0] || courseDescription.trim();
      courseTitle = firstSentence.slice(0, 80).trim();
    }

    return { courseTitle, schedule, derivedToc, derivedSources };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the schedule." };
  }
}

/**
 * Generate lecture materials (slides, module intro, assignment instructions) from a course schedule.
 * Takes a parsed schedule (ScheduleWeekPlan[] JSON) and generates one AssignmentPlan per week with a topic.
 * Returns AssignmentPlan[] shaped entries | error.
 */
export async function generateLectureMaterialsFromScheduleAction(
  scheduleJson: string,
  courseDescription: string,
  minutes: number,
  provider: LlmProvider = "gemini",
  context?: string,
  sourceMaterial?: string
): Promise<AssignmentPlan[] | { error: string }> {
  try {
    await requireOwner();

    // Parse the schedule JSON
    let schedule: ScheduleWeekPlan[];
    try {
      const parsed = JSON.parse(scheduleJson);
      if (!Array.isArray(parsed)) {
        return { error: "Schedule must be a JSON array." };
      }
      schedule = parsed;
    } catch (err) {
      return {
        error: err instanceof Error
          ? `Could not parse schedule JSON: ${err.message}`
          : "Could not parse schedule JSON.",
      };
    }

    if (schedule.length === 0) {
      return { error: "Schedule is empty." };
    }

    const lectureDurationMinutes = Math.max(5, Math.min(Number(minutes) || 50, 240));

    // Filter to weeks with a non-empty topic
    const weeksWithTopics = schedule.filter((w) => w.topic && w.topic.trim());

    if (weeksWithTopics.length === 0) {
      return { error: "No weeks with topics found in the schedule." };
    }

    // Generate one plan per week, with concurrency limit to respect LLM rate limits
    const SCHEDULE_PLAN_CONCURRENCY = 4;
    const plans = await mapWithConcurrency(
      weeksWithTopics,
      SCHEDULE_PLAN_CONCURRENCY,
      (week, index) =>
        buildScheduleWeekPlan(
          week,
          index,
          courseDescription,
          lectureDurationMinutes,
          provider,
          context,
          sourceMaterial,
          // Full schedule (not just weeksWithTopics) so a review/exam/project
          // week's materials can be grounded in every earlier week's chapters.
          schedule
        )
    );

    if (plans.length === 0) {
      return { error: "No materials could be generated from the schedule." };
    }

    return plans;
  } catch (err) {
    return {
      error: err instanceof Error
        ? err.message
        : "Could not generate lecture materials from schedule.",
    };
  }
}


/**
 * Generate a single week's materials (slides + intro + instructions) from the topic and course context.
 * Mirrors buildAssignmentPlan but operates on schedule week data instead of repo content.
 */
async function buildScheduleWeekPlan(
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
