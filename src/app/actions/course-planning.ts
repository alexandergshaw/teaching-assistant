"use server";

import type { SlideData, CourseScheduleRow, CourseScheduleResult, AssignmentPlan, ScheduleWeekPlan } from "../actions-types";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { SLIDE_DECK_JSON_SHAPE, SLIDE_STRUCTURE_REQUIREMENTS, slideDeckJsonShapeWith } from "@/lib/slide-prompt";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { scaffoldModuleIntroDoc, scaffoldAssignmentDoc } from "@/lib/embedded/docs";
import { scaffoldCourseSchedule } from "@/lib/embedded/schedule";
import { applyTextRevision, applySlidesRevision } from "@/lib/embedded/revise";
import { extractTextFromBuffer } from "@/lib/office-extract";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { courseEngineSchedule, courseEngineLecture, courseEngineMaterials, type CourseEngineFile, type CourseEngineUploadFile, type CourseEngineHomework, type ScheduleResponse } from "@/lib/course-engine";
import { requireOwner } from "@/lib/supabase/auth";
import { humanizeAssignmentName } from "@/lib/assignment-name";
import { assignWeekNumbers, renumberWeekLabel } from "@/lib/week-numbering";
import { buildAssignmentPlan, buildStrictTemplateBlock, extractAssignmentContentBundle, extractJsonObject, findAssignmentsPrefix, jsonObjectSlice, listAssignmentFolders, mapWithConcurrency, propagateExampleCodeToFollowups, toSlideData } from "./shared";
import type { AssignmentContentBundle, LectureTemplates } from "./shared";


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


// ── Lecture Planning ─────────────────────────────────────────────────────────


// Extract plain text from a base64-encoded .docx template (best effort).
// Paragraphs that use Word's native list/bullet formatting (a <w:numPr>
// element in the paragraph properties, or a list-style paragraph style) are
// emitted with an explicit "- " (bulleted) or "1. " (numbered) marker so the
// downstream AI sees — and reproduces — the template's bullet structure. Word
// stores list formatting structurally, not as literal characters, so without
// this step bullets are silently lost when the template is flattened to text.
async function extractDocxTemplateText(base64: string): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const buffer = Buffer.from(base64, "base64");
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) return "";
    const xml = await documentXml.async("string");

    const decodeEntities = (value: string) =>
      value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");

    // Convert a single <w:p> paragraph block into its plain text, preserving
    // tabs and intra-paragraph line breaks.
    const paragraphText = (paragraph: string): string => {
      const withBreaks = paragraph
        .replace(/<w:tab\s*\/?>/g, "\t")
        .replace(/<w:br\s*\/?>/g, "\n")
        .replace(/<w:cr\s*\/?>/g, "\n");
      const runs = withBreaks.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
      const text = runs.map((run) => run.replace(/<[^>]+>/g, "")).join("");
      return decodeEntities(text);
    };

    // A paragraph is a list item when its properties contain a numbering
    // reference (<w:numPr>) or its paragraph style name looks like a list.
    const isListParagraph = (paragraph: string): boolean => {
      const props = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
      const propsXml = props ? props[0] : "";
      if (/<w:numPr\b/.test(propsXml)) return true;
      const styleMatch = propsXml.match(/<w:pStyle\s+w:val="([^"]*)"/);
      return !!styleMatch && /list|bullet/i.test(styleMatch[1]);
    };

    // Distinguish numbered lists from bulleted ones when the numbering format
    // is discoverable; default to a bullet marker otherwise.
    const numberingXml = await zip.file("word/numbering.xml")?.async("string");
    const isNumberedList = (paragraph: string): boolean => {
      if (!numberingXml) return false;
      const numIdMatch = paragraph.match(/<w:numId\s+w:val="(\d+)"/);
      if (!numIdMatch) return false;
      const numId = numIdMatch[1];
      const numDef = numberingXml.match(
        new RegExp(`<w:num\\s+w:numId="${numId}"[\\s\\S]*?<w:abstractNumId\\s+w:val="(\\d+)"`)
      );
      if (!numDef) return false;
      const abstractId = numDef[1];
      const abstract = numberingXml.match(
        new RegExp(`<w:abstractNum\\s+w:abstractNumId="${abstractId}"[\\s\\S]*?</w:abstractNum>`)
      );
      if (!abstract) return false;
      const fmtMatch = abstract[0].match(/<w:numFmt\s+w:val="([^"]*)"/);
      return !!fmtMatch && fmtMatch[1] !== "bullet" && fmtMatch[1] !== "none";
    };

    const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    const lines: string[] = [];
    let orderedCounter = 0;
    for (const paragraph of paragraphs) {
      const text = paragraphText(paragraph).trim();
      if (isListParagraph(paragraph)) {
        if (!text) continue;
        if (isNumberedList(paragraph)) {
          orderedCounter += 1;
          lines.push(`${orderedCounter}. ${text}`);
        } else {
          orderedCounter = 0;
          lines.push(`- ${text}`);
        }
      } else {
        orderedCounter = 0;
        lines.push(text);
      }
    }

    return lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return "";
  }
}

// Extract the exact heading lines from a base64-encoded .docx template by
// inspecting which paragraphs are styled as headings/titles in the document.
// This lets the generated document apply heading formatting ONLY where the
// template actually has a heading, never to ordinary body text.
async function extractDocxTemplateHeadings(base64: string): Promise<string[]> {
  try {
    const JSZip = (await import("jszip")).default;
    const buffer = Buffer.from(base64, "base64");
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) return [];
    const xml = await documentXml.async("string");

    const headings: string[] = [];
    const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    for (const paragraph of paragraphs) {
      const styleMatch = paragraph.match(/<w:pStyle\s+w:val="([^"]*)"/);
      if (!styleMatch || !/heading|title/i.test(styleMatch[1])) continue;

      const text = (paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [])
        .map((run) => run.replace(/<[^>]+>/g, ""))
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      if (text) headings.push(text);
    }
    return headings;
  } catch {
    return [];
  }
}

/**
 * Revise one already-generated lecture-plan document (module intro or assignment
 * instructions) from a freeform instruction, preserving its structure/headings.
 * Used by the document editor's "Revise with AI" before download.
 */
export async function reviseLecturePlanTextAction(
  section: "intro" | "instructions",
  assignmentName: string,
  currentText: string,
  instruction: string,
  templateText = "",
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instruction.trim()) return { error: "Describe the change you want first." };
    if (!currentText.trim()) return { error: "There is no document to revise yet." };

    // Embedded Deterministic Engine: apply concrete edit commands (replace,
    // remove/add sections and bullets, retitle, shorten) by rule; an instruction
    // the engine cannot parse leaves the document unchanged.
    if (provider === "embedded") {
      return { text: applyTextRevision(currentText, instruction).text };
    }

    const docKind = section === "intro" ? "module introduction" : "assignment instruction sheet";
    const prompt = `You are an expert educator revising a ${docKind} for a programming course.

ASSIGNMENT / MODULE: ${assignmentName}

CURRENT DOCUMENT:
${currentText}

REVISION INSTRUCTION:
${instruction}

Rewrite the document applying the instruction. Requirements:
- Preserve the overall structure: keep the single level-1 title (one "# " line) and the level-2 "## " section headings.
- For any list, start each item on its own line with a hyphen ("- "); NEVER use numbered lists (no "1.", "2.", etc.). Do not use any other markdown (no bold or italics) in body text.
- Leave content the instruction does not touch intact.
- Never tell students to use, post on, check, or refer to a course discussion board, forum, or message board.
- Output ONLY the revised document text, with no preamble or explanation.${buildStrictTemplateBlock(templateText)}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      },
      provider
    );
    if (!result.ok) {
      return { error: `Revision failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }
    const text = result.text.trim();
    if (!text) return { error: "The model returned an empty document." };
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/** Revise a lecture deck's slides from a freeform instruction (editor: "Revise slides"). */
export async function reviseLectureSlidesAction(
  presentationTitle: string,
  currentSlides: SlideData[],
  instruction: string,
  provider: LlmProvider = "gemini"
): Promise<{ slides: SlideData[] } | { error: string }> {
  try {
    await requireOwner();
    if (!instruction.trim()) return { error: "Describe the change you want first." };

    // Embedded Deterministic Engine: apply concrete edit commands (remove/add/
    // rename slides, remove bullets, replace, shorten) by rule; an instruction
    // the engine cannot parse leaves the deck unchanged.
    if (provider === "embedded") {
      return { slides: applySlidesRevision(currentSlides, instruction).slides };
    }

    const prompt = `You are an expert educator revising a lecture slide deck titled "${presentationTitle}".

CURRENT SLIDES (JSON):
${JSON.stringify(currentSlides, null, 2)}

REVISION INSTRUCTION:
${instruction}

Apply the instruction and return ONLY valid JSON of this shape:
{ "slides": [ { "title": "...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" } ] }

Requirements:
- Maximum 3 bullets per slide; each bullet a single concise idea.
- Preserve slides the instruction does not affect; modify, add, or remove slides as needed.
- Keep "code"/"codeLanguage" only on coding Example/Walkthrough/Practice/Answer slides.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
      },
      provider
    );
    if (!result.ok) {
      return { error: `Revision failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      return { error: "Could not parse slides from the model response." };
    }
    const parsed = JSON.parse(jsonText) as {
      slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
    };
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return { error: "Model did not return a valid slides array." };
    }
    let slides: SlideData[] = parsed.slides
      .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
      .map((s) => toSlideData(s, 3));
    slides = propagateExampleCodeToFollowups(slides);
    return { slides };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/** Extract the strict-template text + heading lines once, for reuse per assignment. */
async function extractLectureTemplates(
  introTemplateBase64?: string,
  instructionsTemplateBase64?: string
): Promise<LectureTemplates> {
  return {
    introTemplateText: introTemplateBase64 ? await extractDocxTemplateText(introTemplateBase64) : "",
    instructionsTemplateText: instructionsTemplateBase64
      ? await extractDocxTemplateText(instructionsTemplateBase64)
      : "",
    // The template's real heading lines, so the downloaded document only applies
    // heading formatting where the template itself has a heading.
    introTemplateHeadings: introTemplateBase64 ? await extractDocxTemplateHeadings(introTemplateBase64) : [],
    instructionsTemplateHeadings: instructionsTemplateBase64
      ? await extractDocxTemplateHeadings(instructionsTemplateBase64)
      : [],
  };
}

export async function generateLecturePlansAction(
  zipBase64: string,
  lectureDurationMinutes: number,
  introTemplateBase64?: string,
  instructionsTemplateBase64?: string,
  provider: LlmProvider = "gemini"
): Promise<AssignmentPlan[] | { error: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"));
    const allPaths = Object.keys(zip.files);

    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return {
        error:
          "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    if (folders.length === 0) {
      return { error: "No assignment subfolders found inside the assignments folder." };
    }

    const bundles: AssignmentContentBundle[] = [];
    for (const folder of folders) {
      const bundle = await extractAssignmentContentBundle(zip, allPaths, prefix, folder);
      if (bundle) bundles.push(bundle);
    }

    if (bundles.length === 0) {
      return { error: "No readable text content found in the assignment folders." };
    }

    const templates = await extractLectureTemplates(introTemplateBase64, instructionsTemplateBase64);

    // Generate each assignment's module, bounding how many run at once (each
    // makes three LLM calls) to stay under the provider's rate limit; the
    // transport layer additionally retries transient failures.
    const LECTURE_PLAN_CONCURRENCY = 4;
    const plans = await mapWithConcurrency(bundles, LECTURE_PLAN_CONCURRENCY, (bundle, index) =>
      buildAssignmentPlan(bundle, index, lectureDurationMinutes, templates, provider)
    );

    if (plans.length === 0) {
      return { error: "No assignments could be generated from the uploaded zip." };
    }

    // Normalize week numbers to match the course schedule: file/module numbering
    // downstream is 1-based and schedule-aligned, so zero-based folder sets are
    // shifted up by one. renumberWeekLabel only rewrites a "week NN" token that
    // is exactly one behind, so already-correct labels pass through unchanged.
    const weekMap = assignWeekNumbers(folders);
    for (const plan of plans) {
      const week = weekMap.get(plan.assignmentName);
      if (week !== undefined) {
        plan.label = renumberWeekLabel(plan.label, week);
        plan.presentationTitle = renumberWeekLabel(plan.presentationTitle, week);
        plan.weekNumber = week;
      }
    }

    return plans;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * List the assignment folders in a course zip (slug + human label) so the UI can
 * offer a picker for single-module generation.
 */
export async function listAssignmentFoldersAction(
  zipBase64: string
): Promise<{ folders: { slug: string; label: string }[] } | { error: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"));
    const allPaths = Object.keys(zip.files);

    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return {
        error:
          "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    if (folders.length === 0) {
      return { error: "No assignment subfolders found inside the assignments folder." };
    }

    const weekMap = assignWeekNumbers(folders);
    return {
      folders: folders.map((slug) => {
        const week = weekMap.get(slug);
        const base = humanizeAssignmentName(slug);
        return { slug, label: week === undefined ? base : renumberWeekLabel(base, week) };
      }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate the full module (slides + intro + instructions) for ONE assignment
 * folder in the zip, identified by its slug (from listAssignmentFoldersAction).
 * Runs the same per-assignment generation as generateLecturePlansAction.
 */
export async function generateLecturePlanForAssignmentAction(
  zipBase64: string,
  slug: string,
  lectureDurationMinutes: number,
  introTemplateBase64?: string,
  instructionsTemplateBase64?: string,
  provider: LlmProvider = "gemini"
): Promise<AssignmentPlan | { error: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"));
    const allPaths = Object.keys(zip.files);

    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return {
        error:
          "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    const index = folders.indexOf(slug);
    if (index === -1) {
      return { error: `Assignment "${slug}" was not found in the uploaded zip.` };
    }

    const bundle = await extractAssignmentContentBundle(zip, allPaths, prefix, slug);
    if (!bundle) {
      return { error: `No readable text content found in the "${slug}" folder.` };
    }

    const templates = await extractLectureTemplates(introTemplateBase64, instructionsTemplateBase64);

    // Preserve the assignment's natural ordering (its position in the sorted
    // folder list) so a single module sorts correctly if merged into a list.
    const plan = await buildAssignmentPlan(bundle, index, lectureDurationMinutes, templates, provider);

    // Normalize week numbers to match the course schedule, same as generateLecturePlansAction.
    const weekMap = assignWeekNumbers(folders);
    const week = weekMap.get(slug);
    if (week !== undefined) {
      plan.label = renumberWeekLabel(plan.label, week);
      plan.presentationTitle = renumberWeekLabel(plan.presentationTitle, week);
      plan.weekNumber = week;
    }

    return plan;
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

/**
 * Generate a course schedule from a high-level description, distributing assignments and tests evenly.
 * Returns a courseTitle and the structured week plan used by workflows (assignment slugs + test
 * flags), unlike generateCourseScheduleAction, which produces display rows for the syllabus.
 */
export async function generateSchedulePlanAction(
  courseDescription: string,
  weeks: number,
  tests: number,
  provider: LlmProvider = "gemini"
): Promise<{ courseTitle: string; schedule: ScheduleWeekPlan[] } | { error: string }> {
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
    const prompt = `You are an expert curriculum designer. Given a course description, produce a JSON object ONLY (no markdown fences) with:
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

    return { courseTitle, schedule };
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
  provider: LlmProvider = "gemini"
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
          provider
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
  provider: LlmProvider
): Promise<AssignmentPlan> {
  const weekNumber = week.week || index + 1;
  const label = `Week ${weekNumber}`;
  const topic = week.topic.trim();
  const summary = week.summary?.trim() || "";
  const assignmentTitle = week.assignmentTitle?.trim() || `Week ${weekNumber} Deliverable`;

  // Generate slides only (one LLM call per week cap)
  const slidesResult = await generateSlidesFromTopic(topic, summary, courseDescription, lectureDurationMinutes, provider);

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
  provider: LlmProvider
): Promise<{ presentationTitle: string; slides: SlideData[] } | { error: string }> {
  // Embedded Deterministic Engine
  if (provider === "embedded") {
    return scaffoldLessonPlan(topic, summary);
  }

  const prompt = `You are an expert educator creating a lecture slide deck for a course. The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

TOPIC: ${topic}

WEEK SUMMARY: ${summary}

COURSE DESCRIPTION: ${courseDescription}

LECTURE DURATION: ${lectureDurationMinutes} minutes

Based on the topic and summary above, create a complete lecture slide deck that teaches students the key concepts and skills for this week. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).

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
