"use server";

import {
  gradeSubmissions,
  gradeCanvasUrl,
  synthesizeFullCreditChecklist,
  extractSubmissions,
  generateRubric,
  scaleResultToPoints,
  type GradingRun,
} from "@/lib/grade";
import { extractTextFromBuffer } from "@/lib/office-extract";
import {
  fetchCanvasWork,
  canvasWorkToZipBase64,
  fetchCanvasMeta,
  fetchAssignmentPointsPossible,
  getSpeedGraderUrl,
  postCanvasGrades,
  getCourseName,
  listAnnouncements,
  createAnnouncement,
  listConversations,
  getConversation,
  replyToConversation,
  listGradingQueue,
  getNeedsGradingCount,
  getUnreadCount,
  listCourses,
  setConversationWorkflowState,
  type CanvasAnnouncement,
  type CanvasConversationSummary,
  type CanvasConversationDetail,
  type CanvasQueueItem,
  type CanvasCourse,
} from "@/lib/canvas";
import {
  listModules,
  createModule,
  updateModule,
  deleteModule,
  createModuleItem,
  updateModuleItem,
  deleteModuleItem,
  listPages,
  getPage,
  updatePage,
  createPage,
  deletePage,
  listAddableContent,
  setDueDates,
  requestFileUpload,
  listCourseFiles,
  renameCourseFile,
  deleteCourseFile,
  listBulkItems,
  bulkUpdate,
  bulkDelete,
  listRubrics,
  bulkAssociateRubric,
  createRubric,
  getGradable,
  updateGradable,
  createGradable,
  getFilePreview,
  getOfficeEditable,
  saveOfficeEdits,
  listQuizQuestions,
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  type CanvasModule,
  type CanvasPageSummary,
  type CanvasPage,
  type CanvasAddableContent,
  type NewModuleItem,
  type DueDateUpdate,
  type FileUploadTicket,
  type BulkItem,
  type BulkKind,
  type CourseFile,
  type CanvasRubric,
  type GradableKind,
  type GradableDetail,
  type FilePreview,
  type RubricCriterionInput,
  type QuizQuestion,
  type QuizQuestionInput,
} from "@/lib/canvas-modules";
import type { OfficeKind, OfficeParagraph } from "@/lib/office-edit";
import { callLlm, normalizeProvider, type LlmProvider } from "@/lib/llm";
import { filesToLlmParts } from "@/lib/llm-files";
import {
  courseEngineSchedule,
  courseEngineLecture,
  courseEngineMaterials,
  courseEngineCopilotPrompt,
  type CourseEngineFile,
  type CourseEngineUploadFile,
  type CourseEngineHomework,
  type ScheduleResponse,
} from "@/lib/course-engine";
import {
  gradeViaGradingEngine,
  detectRubricSource,
  type GradingApiResponse,
} from "@/lib/grading-engine";
import { createClient } from "@/lib/supabase/server";
import { logChatExchange } from "@/lib/supabase/chat-logs";
import { requireOwner } from "@/lib/supabase/auth";
import {
  getCredentials,
  getValidAccessToken,
  deleteCredentials,
} from "@/lib/google-credentials";
import {
  queryFreeBusy,
  createCalendarEvent,
  listCalendarEvents,
  type CalendarEventBlock,
} from "@/lib/google-calendar";
import {
  getSchedulingConfig,
  computeFreeSlots,
  formatSlotsForReply,
} from "@/lib/scheduling";
import {
  listDismissals,
  addDismissal,
  removeDismissal,
} from "@/lib/grading-dismissals";
import { humanizeAssignmentName, stripAssignmentSlugPrefix, looksLikeAssignmentSlug } from "@/lib/assignment-name";
import type JSZip from "jszip";

export interface SlideData {
  title: string;
  bullets: string[];
  // Optional example code snippet, rendered as a formatted monospace code block
  // in the generated deck. Populated on the example slide that immediately
  // follows a coding-concept slide (loops, conditionals, functions, etc.).
  code?: string;
  // Language label for the code block (e.g. "python", "javascript").
  codeLanguage?: string;
}

// Normalize a parsed slide from the model into SlideData, carrying through an
// optional example code block when present. Shared by every Gemini slide path
// so code slides are handled identically everywhere.
function toSlideData(
  raw: { title?: string; bullets?: string[]; code?: string; codeLanguage?: string },
  maxBullets: number
): SlideData {
  const slide: SlideData = {
    title: raw.title!,
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

// Force the Walkthrough and Practice slides that follow an Example slide to
// display the Example's reference code. The Example teaches the concept with
// code, the Walkthrough explains that same code line by line, and the Practice
// gives students that worked example to reference while they attempt the
// challenge. Critically, the Practice slide must NOT reveal the answer, so we
// overwrite whatever code the model put there with the Example's reference code
// (not just fill when missing — the model might otherwise leak the solution).
// The Answer slide keeps its own distinct solution code and is never touched.
function propagateExampleCodeToFollowups(slides: SlideData[]): SlideData[] {
  let exampleCode: string | undefined;
  let exampleLanguage: string | undefined;
  for (const slide of slides) {
    if (slide.title.startsWith("Example:")) {
      // Remember this example's code as the reference for the slides that follow.
      exampleCode = slide.code;
      exampleLanguage = slide.codeLanguage;
    } else if (
      (slide.title.startsWith("Walkthrough:") || slide.title.startsWith("Practice:")) &&
      exampleCode
    ) {
      // Always use the Example's reference code, overriding any code the model
      // produced for these slides (a Practice snippet could otherwise spoil the
      // answer; a Walkthrough must match the example it explains).
      slide.code = exampleCode;
      if (exampleLanguage) {
        slide.codeLanguage = exampleLanguage;
      }
    }
  }
  return slides;
}

export interface GenerateLessonPlanResult {
  presentationTitle: string;
  slides: SlideData[];
}

export interface AssignmentStep {
  stepTitle: string;
  description: string;
}

export interface AssignmentData {
  title: string;
  overview: string;
  steps: AssignmentStep[];
  tools: string[];
  deliverables: string[];
}

export interface ModuleIntroData {
  overview: string;
  keyTerms: string;
}

export async function generateModuleIntroAction(
  moduleObjectives: string,
  contextText: string,
  provider: LlmProvider = "gemini"
): Promise<ModuleIntroData | { error: string }> {
  try {
    const prompt = `You are an expert educator writing a module introduction for students.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}

Write a brief module introduction that students read before engaging with any content. Return ONLY valid JSON:
{
  "overview": "...",
  "keyTerms": "..."
}

Requirements:
- "overview": Exactly 2-3 sentences. Explain where these module concepts fit in the broader field or discipline — the big picture, why it matters, and how it connects to what students may already know or have learned previously. Write directly to the student.
- "keyTerms": Exactly 2-3 sentences that introduce the most important terms or concepts students will encounter in this module, defining each briefly in plain language. Write directly to the student.
- Use clear, engaging language. Avoid jargon unless you define it immediately.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Module intro generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse module intro from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      overview?: string;
      keyTerms?: string;
    };

    return {
      overview: parsed.overview ?? "",
      keyTerms: parsed.keyTerms ?? "",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateLessonPlanAction(
  moduleObjectives: string,
  contextText: string,
  files: Array<{ name: string; base64: string; mimeType: string }>,
  revisionPrompt?: string,
  currentSlides?: SlideData[],
  provider: LlmProvider = "gemini",
  homework?: {
    text?: string;
    files?: Array<{ name: string; base64: string; mimeType: string }>;
  }
): Promise<GenerateLessonPlanResult | { error: string }> {
  try {
    const filesSummary =
      files.length > 0
        ? `\n\nATTACHED FILES (${files.length}):\n${files.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const revisionSection =
      revisionPrompt && currentSlides
        ? `\n\nCURRENT SLIDE DECK (JSON):\n${JSON.stringify(currentSlides, null, 2)}\n\nREVISION INSTRUCTIONS:\n${revisionPrompt}\n\nUpdate the slide deck based on the revision instructions. Preserve slides that don't need to change; modify, add, or remove slides as needed.`
        : "";

    const homeworkText = homework?.text?.trim() ?? "";
    const homeworkFiles = homework?.files ?? [];
    const hasHomework = homeworkText.length > 0 || homeworkFiles.length > 0;

    const homeworkSection = hasHomework
      ? `\n\nHOMEWORK ASSIGNMENT (the slides must prepare students to complete this, WITHOUT revealing its answers):\n${homeworkText || "(provided as an attached file below)"}`
      : "";

    const homeworkRequirement = hasHomework
      ? `\n- HOMEWORK PREPARATION: A homework assignment is provided above. Ensure the deck teaches every concept, skill, and technique a student needs to complete it confidently on their own. The Example, Practice, and Answer slides MUST use different problems than the homework's own questions. Never restate the homework's exact questions, never solve any homework problem, and never reveal its answers — the goal is to prepare students to do it themselves, not to do it for them.`
      : "";

    const prompt = `You are an expert educator creating a lecture slide deck.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}${filesSummary}${revisionSection}${homeworkSection}

Create a complete set of lecture slides that fully address the module objectives. Return ONLY valid JSON:
{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."] },
    { "title": "Case Study: ...", "bullets": ["...", "...", "..."] },
    { "title": "Example: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Walkthrough: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" },
    { "title": "Practice: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" }
  ]
}

Requirements:
- Each slide must have a "title" and a "bullets" array.
- Maximum 3 bullets per slide.
- Each bullet must be a single, concise idea — no sub-points.
- Use plenty of real-world analogies and concrete examples that students will immediately recognise (everyday technology, social media, sports, food, pop culture, etc.).
- The first slide should be a title/overview slide listing the key topics.
- The SECOND slide MUST be a real-world case study or news story about this module's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event (the organization or product involved and roughly when it happened). Prefer a dramatic, motivating story — a high-profile failure, security breach, or outage, OR an impressive system that was built — to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Do not put "code" on this slide. Stick to established facts; never invent events or fabricate specifics.
- Include enough slides to thoroughly cover every objective.
- CODING CONCEPTS: Whenever a slide introduces a coding concept (a loop, conditional, variable, function, class, data structure, etc.), it MUST be followed immediately by exactly four slides, in this order:
  1. Example slide — "title" begins with "Example:"; demonstrate that exact concept with a short, correct, self-contained snippet in "code" (use real newlines) and "codeLanguage" set; keep "bullets" to at most one short caption.
  2. Walkthrough slide — "title" begins with "Walkthrough:"; explain the example code line by line in "bullets" while showing the same code in the "code" field; use the exact code from the Example slide so students can read both the code and the explanation together.
  3. Practice slide — "title" begins with "Practice:"; pose a simple, self-contained coding challenge on the same concept for the student to attempt. State the task in 1-2 "bullets" and set "codeLanguage". Its "code" field MUST repeat the SAME reference code shown on the Example/Walkthrough slide so the student has a worked example to reference — it must NOT contain the solution to the practice challenge or any code that gives away the answer.
  4. Answer slide — "title" begins with "Answer:"; give the correct, runnable solution to that exact practice challenge in "code" with "codeLanguage" set, plus at most one "bullets" caption.
- All of Example, Walkthrough, Practice, and Answer slides must include "code"/"codeLanguage". Do not omit "code" on Walkthrough or Practice slides. If the module teaches no programming, omit code fields and the Example/Walkthrough/Practice/Answer slides entirely.${homeworkRequirement}
- Do not include any text outside the JSON object.`;

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: prompt },
      ...(await filesToLlmParts(files)),
      ...(await filesToLlmParts(homeworkFiles, "HOMEWORK ASSIGNMENT")),
    ];

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `LLM API error: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse slide data from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      presentationTitle?: string;
      slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
    };

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return { error: "Model did not return a valid slides array." };
    }

    let slides: SlideData[] = parsed.slides
      .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
      .map((s) => toSlideData(s, 3));

    slides = propagateExampleCodeToFollowups(slides);

    return {
      presentationTitle: parsed.presentationTitle ?? "Lesson Plan",
      slides,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateAssignmentAction(
  moduleObjectives: string,
  contextText: string,
  files: Array<{ name: string; base64: string; mimeType: string }>,
  provider: LlmProvider = "gemini"
): Promise<AssignmentData | { error: string }> {
  try {
    const filesSummary =
      files.length > 0
        ? `\n\nATTACHED FILES (${files.length}):\n${files.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const prompt = `You are an expert educator designing a hands-on, industry-simulating assignment.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}${filesSummary}

Design a practical assignment that simulates real industry workflows and that students can complete entirely for free. Return ONLY valid JSON:
{
  "title": "...",
  "overview": "...",
  "steps": [
    { "stepTitle": "...", "description": "..." }
  ],
  "tools": ["..."],
  "deliverables": ["..."]
}

Requirements:
- Simulate authentic challenges students will face on the job.
- Every tool listed must be free and accessible (e.g. Python, VS Code, Google Colab, GitHub, Figma free tier, Canva, Google Sheets, Replit, etc.).
- 4–8 concrete, sequential steps that a student can complete working alone.
- Tie every step clearly to the module objectives.
- Deliverables should be specific and assessable.
- Do not include any text outside the JSON object.`;

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: prompt },
      ...(await filesToLlmParts(files)),
    ];

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Assignment generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse assignment data from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      title?: string;
      overview?: string;
      steps?: Array<{ stepTitle?: string; description?: string }>;
      tools?: string[];
      deliverables?: string[];
    };

    return {
      title: parsed.title ?? "Assignment",
      overview: parsed.overview ?? "",
      steps: (parsed.steps ?? [])
        .filter((s) => s.stepTitle && s.description)
        .map((s) => ({ stepTitle: s.stepTitle!, description: s.description! })),
      tools: parsed.tools ?? [],
      deliverables: parsed.deliverables ?? [],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateAssignmentRubricAction(
  moduleObjectives: string,
  contextText: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    const instructions = `MODULE OBJECTIVES:\n${moduleObjectives}${contextText ? `\n\nCONTEXT:\n${contextText}` : ""}`;
    return await generateRubric(instructions, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Rubric generation failed." };
  }
}

export interface ExampleItem {
  concept: string;
  title: string;
  content: string;
  explanation: string;
  language?: string;
}

export interface ExamplesData {
  lessonType: "math" | "programming" | "general";
  examples: ExampleItem[];
}

export async function generateExamplesAction(
  moduleObjectives: string,
  contextText: string,
  slides: SlideData[],
  provider: LlmProvider = "gemini"
): Promise<ExamplesData | { error: string }> {
  try {

    const conceptList = slides
      .map((s, i) => `${i + 1}. ${s.title}`)
      .join("\n");

    const prompt = `You are an expert educator preparing in-class examples for a lecture.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}

CONCEPTS INTRODUCED IN THIS LESSON (one per slide):
${conceptList}

First, determine the primary focus of this lesson:
- "math" if the lesson is primarily about mathematics, statistics, or quantitative methods
- "programming" if the lesson is primarily about programming, software, or coding
- "general" for all other topics

Then generate exactly 2 examples for EACH concept listed above. Each example must:
- Address only the single concept it is assigned to — do not mix in other concepts from the lesson.
- Be appropriate to the lesson type:
  - "math": a worked problem with a clear problem statement and step-by-step solution
  - "programming": a short, complete, runnable code snippet (20–40 lines) with a brief explanation; use the most natural language for the topic
  - "general": a concrete worked example, case study, or demonstration

Return ONLY valid JSON:
{
  "lessonType": "math" | "programming" | "general",
  "examples": [
    {
      "concept": "Exact concept name from the list above",
      "title": "Short descriptive title for this specific example",
      "content": "The problem statement (math) or the full code snippet (programming) or the example scenario (general)",
      "explanation": "Step-by-step solution (math), what the code does and why (programming), or key takeaways (general)",
      "language": "python"
    }
  ]
}

Requirements:
- Produce exactly 2 examples per concept, in concept order.
- Each example must cover only its assigned concept — never blend it with another concept from the lesson.
- "concept" must exactly match the concept name from the list above.
- "language" is required only for programming examples (e.g. "python", "javascript", "java", "c", "sql"); omit it for math and general examples.
- Math problems should include all working steps in "explanation".
- Code examples must be complete and runnable as-is; use comments to annotate key lines.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 3072 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Examples generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse examples from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      lessonType?: string;
      examples?: Array<{ concept?: string; title?: string; content?: string; explanation?: string; language?: string }>;
    };

    const lessonType =
      parsed.lessonType === "math" || parsed.lessonType === "programming"
        ? parsed.lessonType
        : "general";

    const examples: ExampleItem[] = (parsed.examples ?? [])
      .filter((e) => e.title && e.content && e.explanation)
      .map((e) => ({
        concept: e.concept ?? "",
        title: e.title!,
        content: e.content!,
        explanation: e.explanation!,
        ...(e.language ? { language: e.language } : {}),
      }));

    return { lessonType, examples };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export interface SyllabusSection {
  heading: string;
  hint: string;
}

type SyllabusContextFile = { name: string; base64: string; mimeType: string };
const SYLLABUS_VERTICAL_LIST_REQUIREMENT =
  "Write all content as cleanly separated paragraphs. Do not use bullet points, numbered lists, dashes, asterisks, or any other list or markdown formatting. Each distinct point or idea should be its own standalone paragraph separated by a blank line. Never start a line with a dash, bullet, number, or letter followed by a period or parenthesis."

const SYLLABUS_SCHEDULE_REQUIREMENT =
  "For any course schedule or weekly plan section, include a Week number (e.g. Week 1, Week 2, …) AND the specific date(s) for that week — derive the dates from the academic calendar provided in context. List one week per line. Be sure to include all breaks (e.g. holiday breaks, spring break, fall break, etc.) from the academic calendar as their own entries in the schedule.";

async function appendSyllabusContextParts(
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
  files: SyllabusContextFile[]
) {
  parts.push(...(await filesToLlmParts(files, "ADDITIONAL CONTEXT FILE")));
}

export async function parseSyllabusAction(
  courseTitle: string,
  file: { name: string; base64: string; mimeType: string },
  additionalContext?: string,
  contextFiles: SyllabusContextFile[] = [],
  provider: LlmProvider = "gemini"
): Promise<{ sections: SyllabusSection[]; templateText: string } | { error: string }> {
  try {
    const additionalContextBlock = additionalContext?.trim()
      ? `\n\nADDITIONAL COURSE CONTEXT:\n${additionalContext.trim()}`
      : "";
    const contextFilesSummary =
      contextFiles.length > 0
        ? `\n\nADDITIONAL CONTEXT FILES:\n${contextFiles.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const prompt = `You are parsing a syllabus template for a course called "${courseTitle}".${additionalContextBlock}${contextFilesSummary}

Extract each distinct section from this document. Return ONLY valid JSON:
{
  "sections": [
    { "heading": "Section Name", "hint": "What should go in this section based on the template's placeholder text, structure, or context" }
  ]
}

Requirements:
- Identify every major section or heading in the document.
- The "hint" should describe what content belongs in this section — use placeholder text, examples, or structural cues from the template.
- Keep headings short and clear, exactly as they appear in the template.
- Do not include any text outside the JSON object.`;

    // Gemini natively supports PDF and text/*; extract text from office formats first.
    const isNativelySupported =
      file.mimeType === "application/pdf" ||
      file.mimeType.startsWith("text/") ||
      file.mimeType.startsWith("image/");

    let parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
    let extractedText = "";

    if (isNativelySupported) {
      const templateText = file.mimeType.startsWith("text/")
        ? Buffer.from(file.base64, "base64").toString("utf-8")
        : ""; // PDF/image: text not extractable without extra dependencies
      parts = [
        { text: prompt },
        { inlineData: { mimeType: file.mimeType, data: file.base64 } },
      ];
      await appendSyllabusContextParts(parts, contextFiles);

      const result = await callLlm(
        {
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        },
        provider
      );

      if (!result.ok) {
        return { error: `Syllabus parsing failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
      }

      const raw = result.text;
      const trimmed = raw.trim();
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start === -1 || end === -1) return { error: "Could not parse sections from the syllabus template." };

      const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
        sections?: Array<{ heading?: string; hint?: string }>;
      };

      const sections: SyllabusSection[] = (parsed.sections ?? [])
        .filter((s) => typeof s.heading === "string" && s.heading.trim())
        .map((s) => ({ heading: s.heading!.trim(), hint: s.hint?.trim() ?? "" }));

      if (sections.length === 0) return { error: "No sections found in the syllabus template." };
      return { sections, templateText };
    } else {
      // Extract plain text from DOCX / PPTX / XLSX / etc. via the shared extractor.
      try {
        const text = await extractTextFromBuffer(
          file.name,
          Buffer.from(file.base64, "base64")
        );
        extractedText = text?.trim() ?? "";
      } catch {
        return { error: "Could not read the uploaded file. Please try a .txt, .pdf, or .docx file." };
      }

      if (!extractedText) {
        return { error: "The uploaded file appears to be empty or could not be read." };
      }
      parts = [{ text: `${prompt}\n\nSYLLABUS TEMPLATE TEXT:\n${extractedText}` }];
      await appendSyllabusContextParts(parts, contextFiles);
    }

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Syllabus parsing failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;
    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) return { error: "Could not parse sections from the syllabus template." };

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      sections?: Array<{ heading?: string; hint?: string }>;
    };

    const sections: SyllabusSection[] = (parsed.sections ?? [])
      .filter((s) => typeof s.heading === "string" && s.heading.trim())
      .map((s) => ({ heading: s.heading!.trim(), hint: s.hint?.trim() ?? "" }));

    if (sections.length === 0) return { error: "No sections found in the syllabus template." };
    return { sections, templateText: extractedText };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateSyllabusSectionAction(
  courseTitle: string,
  section: SyllabusSection,
  completedSections: Array<{ heading: string; content: string }>,
  templateText?: string,
  additionalContext?: string,
  contextFiles: SyllabusContextFile[] = [],
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    const templateBlock = templateText
      ? `\n\nORIGINAL SYLLABUS TEMPLATE:\n${templateText}`
      : "";

    const contextBlock =
      completedSections.length > 0
        ? `\n\nPREVIOUSLY COMPLETED SECTIONS:\n${completedSections
            .map((s) => `${s.heading}:\n${s.content}`)
            .join("\n\n")}`
        : "";
    const additionalContextBlock = additionalContext?.trim()
      ? `\n\nADDITIONAL COURSE CONTEXT:\n${additionalContext.trim()}`
      : "";
    const contextFilesSummary =
      contextFiles.length > 0
        ? `\n\nADDITIONAL CONTEXT FILES:\n${contextFiles.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const prompt = `You are writing content for a university course syllabus.

COURSE TITLE: ${courseTitle}
SECTION: ${section.heading}
GUIDANCE: ${section.hint || "Write appropriate content for this syllabus section."}${templateBlock}${additionalContextBlock}${contextFilesSummary}${contextBlock}

Write the content for the "${section.heading}" section of this syllabus. Be specific, professional, and practical. Use the guidance, the original template, and any previously completed sections for context and consistency. Write only the section content — do not include the heading itself, markdown formatting, or any preamble. ${SYLLABUS_VERTICAL_LIST_REQUIREMENT} ${SYLLABUS_SCHEDULE_REQUIREMENT} If you need to make a late policy, be sure that assignments submitted after the deadline can only earn a maxiumum of 85%, be sure it encourages resubmissions and prevents AI abuse in a way that is not time demanding for the instructor.`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];
    await appendSyllabusContextParts(parts, contextFiles);

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Section generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;
    return raw.trim() || "Could not generate content for this section.";
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateSyllabusRemainingSectionsAction(
  courseTitle: string,
  sections: SyllabusSection[],
  currentContents: string[],
  startIndex: number,
  templateText?: string,
  additionalContext?: string,
  contextFiles: SyllabusContextFile[] = [],
  provider: LlmProvider = "gemini"
): Promise<{ contents: string[] } | { error: string }> {
  try {
    const existingBlock = sections
      .map((s, i) => `${s.heading}:\n${currentContents[i] || "(empty)"}`)
      .join("\n\n");

    const remainingBlock = sections
      .slice(startIndex)
      .map((s, idx) => `${startIndex + idx + 1}. ${s.heading}${s.hint ? ` (${s.hint})` : ""}`)
      .join("\n");

    const templateBlock = templateText
      ? `\n\nORIGINAL SYLLABUS TEMPLATE:\n${templateText}`
      : "";
    const additionalContextBlock = additionalContext?.trim()
      ? `\n\nADDITIONAL COURSE CONTEXT:\n${additionalContext.trim()}`
      : "";
    const contextFilesSummary =
      contextFiles.length > 0
        ? `\n\nADDITIONAL CONTEXT FILES:\n${contextFiles.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const prompt = `You are writing the remaining content for a university course syllabus.

COURSE TITLE: ${courseTitle}${templateBlock}${additionalContextBlock}${contextFilesSummary}

CURRENT SYLLABUS STATE:
${existingBlock}

FILL THESE REMAINING SECTIONS (in order):
${remainingBlock}

Return ONLY valid JSON:
{
  "sections": [
    { "heading": "Section Name", "content": "Generated content..." }
  ]
}

Requirements:
- Return only the sections listed in "FILL THESE REMAINING SECTIONS".
- Preserve each heading exactly.
- Use existing filled sections for consistency.
- ${SYLLABUS_VERTICAL_LIST_REQUIREMENT}
- ${SYLLABUS_SCHEDULE_REQUIREMENT}
- Do not include any text outside the JSON object.`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];
    await appendSyllabusContextParts(parts, contextFiles);

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Section generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;
    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse section data from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      sections?: Array<{ heading?: string; content?: string }>;
    };

    const updated = [...currentContents];
    const remaining = sections.slice(startIndex);
    for (let i = 0; i < remaining.length; i++) {
      const target = remaining[i];
      const byIndex = parsed.sections?.[i];
      let content = byIndex?.content?.trim() ?? "";
      if (!content) {
        const byHeading = parsed.sections?.find(
          (s) => s.heading?.trim().toLowerCase() === target.heading.toLowerCase()
        );
        content = byHeading?.content?.trim() ?? "";
      }
      if (content) {
        updated[startIndex + i] = content;
      }
    }

    return { contents: updated };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function reviseSyllabusAction(
  courseTitle: string,
  sections: SyllabusSection[],
  contents: string[],
  templateText: string,
  revisionPrompt: string,
  files: Array<{ name: string; base64: string; mimeType: string }> = [],
  additionalContext?: string,
  contextFiles: SyllabusContextFile[] = [],
  lockedSections: boolean[] = [],
  provider: LlmProvider = "gemini"
): Promise<{ contents: string[] } | { error: string }> {
  try {
    const syllabusText = sections
      .map((s, i) => `${s.heading}:\n${contents[i] || "(empty)"}`)
      .join("\n\n");

    const templateBlock = templateText
      ? `\n\nORIGINAL SYLLABUS TEMPLATE:\n${templateText}`
      : "";
    const additionalContextBlock = additionalContext?.trim()
      ? `\n\nADDITIONAL COURSE CONTEXT:\n${additionalContext.trim()}`
      : "";
    const contextFilesSummary =
      contextFiles.length > 0
        ? `\n\nADDITIONAL CONTEXT FILES:\n${contextFiles.map((f) => `- ${f.name}`).join("\n")}`
        : "";
    const lockedHeadings = sections
      .map((section, i) => ({ heading: section.heading, locked: !!lockedSections[i] }))
      .filter((s) => s.locked)
      .map((s) => s.heading);
    const lockedSectionsBlock =
      lockedHeadings.length > 0
        ? `\n\nLOCKED SECTIONS (DO NOT CHANGE THESE):\n${lockedHeadings.map((h) => `- ${h}`).join("\n")}`
        : "";

    const prompt = `You are revising a university course syllabus for "${courseTitle}".${templateBlock}${additionalContextBlock}${contextFilesSummary}${lockedSectionsBlock}

CURRENT SYLLABUS:
${syllabusText}

REVISION INSTRUCTIONS:
${revisionPrompt}

Return ONLY valid JSON with updated content for all ${sections.length} sections in the same order:
{
  "sections": [
    { "heading": "Section Name", "content": "Updated content..." }
  ]
}

Requirements:
- Preserve all section headings exactly as shown.
- Do not modify any section listed under LOCKED SECTIONS.
- Apply the revision instructions intelligently; leave unaffected sections unchanged.
- ${SYLLABUS_VERTICAL_LIST_REQUIREMENT}
- ${SYLLABUS_SCHEDULE_REQUIREMENT}
- Do not include any text outside the JSON object.`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];
    await appendSyllabusContextParts(parts, contextFiles);

    parts.push(...(await filesToLlmParts(files, "ATTACHED FILE")));

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Syllabus revision failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;
    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return { error: "Could not parse revised syllabus from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      sections?: Array<{ heading?: string; content?: string }>;
    };

    const updatedContents = sections.map((section, i) => {
      if (lockedSections[i]) return contents[i] ?? "";

      // Prefer index-based match, fall back to heading match.
      const byIndex = parsed.sections?.[i];
      if (byIndex?.content?.trim()) return byIndex.content.trim();
      const byHeading = parsed.sections?.find(
        (s) => s.heading?.trim().toLowerCase() === section.heading.toLowerCase()
      );
      return byHeading?.content?.trim() ?? contents[i] ?? "";
    });

    return { contents: updatedContents };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export interface TestGeminiState {
  result: string | null;
  error: string | null;
}

export async function assembleSyllabusFromTemplateAction(
  templateFile: { name: string; base64: string; mimeType: string },
  sections: SyllabusSection[],
  contents: string[],
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    const sectionsText = sections
      .map((s, i) => `${s.heading}:\n${contents[i] || "(no content generated)"}`)
      .join("\n\n---\n\n");

    const prompt = `You are reconstructing a formatted syllabus document. The original template is attached. The generated content for each section is provided below.

Your task: Reproduce the ENTIRE document, preserving every aspect of the original template's formatting — heading styles, spacing, line breaks, decorators, numbering, and any text that appears between sections or before the first section. For each section, replace only the body content with the generated content below. If a section has no generated content, keep the original placeholder text.

Output ONLY the reconstructed document text — no preamble, no explanation.

GENERATED SECTION CONTENT:
${sectionsText}`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];

    parts.push(...(await filesToLlmParts([templateFile], "ORIGINAL TEMPLATE")));

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Assembly failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const text = result.text;
    return { text: text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function testGeminiAction(
  _prev: TestGeminiState,
  formData: FormData
): Promise<TestGeminiState> {
  try {
    const provider = normalizeProvider(formData.get("provider") as string | null);

    const file = formData.get("studentSubmissions") as File | null;
    if (!file || file.size === 0) {
      return { result: null, error: "Please select a zip file to test with." };
    }

    const zipBuffer = await file.arrayBuffer();
    const { submissions } = await extractSubmissions(zipBuffer);

    const entries = Object.entries(submissions);
    if (entries.length === 0) {
      return { result: null, error: "No readable text files found in the zip." };
    }

    // Take the first submission, truncated to 2000 chars to keep the request small
    const [fileName, content] = entries[0];
    const truncated = content.length > 2000 ? content.slice(0, 2000) + "\n\n[truncated]" : content;

    const result = await callLlm(
      {
        contents: [
          {
            role: "user",
            parts: [{ text: `Summarize this student file in one sentence.\n\nFile: ${fileName}\n\n${truncated}` }],
          },
        ],
      },
      provider
    );

    if (!result.ok) {
      return { result: null, error: `HTTP ${result.status}: ${result.body}` };
    }

    const text = result.text || "(no response text)";

    return { result: `[${fileName}] ${text}`, error: null };
  } catch (err) {
    return {
      result: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export interface GradeActionState {
  run: GradingRun | null;
  error: string | null;
  generatedRubric?: string;
  warnings?: string[];
}

// Map the deterministic Grading API response onto the app's GradingRun so the
// existing results matrix in GradingTab renders it unchanged. The grader returns
// no per-student files and no full-credit checklist, so those degrade to "-" /
// hidden in the UI.
//
// When grading from a Canvas URL, pointsPossible re-bases the engine's rubric
// total onto the assignment's real scale (same anchoring as the AI path), so the
// tool never grades out of a different total than Canvas.
function gradingApiToRun(
  resp: GradingApiResponse,
  pointsPossible: number | null = null
): GradingRun {
  return {
    rubricAreaNames: resp.criteria,
    fullCreditChecklist: [],
    results: resp.students.map((s) => {
      const passedCount = s.criteria.filter((c) => c.passed).length;
      const rawAreas = s.criteria.map((c) => ({
        area: c.criterion,
        score: `${c.points_earned}/${c.points_possible}`,
        comment: c.detail,
      }));
      const scaled = scaleResultToPoints(rawAreas, `${s.total}/${s.possible}`, pointsPossible);
      return {
        student: s.student,
        totalScore: scaled.totalScore,
        overallComment: `${passedCount}/${s.criteria.length} checks passed`,
        feedback: "",
        mergedFileCount: 0,
        submittedFiles: [],
        rubricAreas: scaled.rubricAreas,
      };
    }),
  };
}

/**
 * Fetch a Canvas assignment/discussion's description + rubric so the grading
 * form can prefill the instructions and rubric boxes from a pasted URL.
 */
export async function fetchCanvasMetaAction(
  url: string
): Promise<{ description: string; rubricText: string } | { error: string }> {
  try {
    await requireOwner();
    // Return Canvas's own rubric only; never synthesize one when Canvas has none.
    return await fetchCanvasMeta(url);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load Canvas details." };
  }
}

/** Post reviewed grades + comments back to Canvas (one PUT per student). */
export async function postCanvasGradesAction(
  url: string,
  grades: Array<{
    userId: number;
    grade?: string;
    comment?: string;
    rubricAreas?: Array<{ area: string; score: string; comment: string }>;
  }>
): Promise<
  { posted: number; failures: Array<{ userId: number; error: string }> } | { error: string }
> {
  try {
    await requireOwner();
    return await postCanvasGrades(url, grades);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post grades to Canvas." };
  }
}

// ── Canvas announcements + inbox (the Canvas tab) ───────────────────────────
//
// Every action below is owner-gated (owner allowlist + AAL2) because it uses the
// privileged Canvas API token, or — for the AI drafts — bills LLM usage. Each
// returns plain serializable data or an { error } string the UI surfaces inline.

/** Load a course's name + recent announcements for the announcements panel. */
/** List the active teacher courses for an institution (announcements picker). */
export async function listCoursesAction(
  acronym: string
): Promise<{ courses: CanvasCourse[] } | { error: string }> {
  try {
    await requireOwner();
    return { courses: await listCourses(acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load courses." };
  }
}

export async function listAnnouncementsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ courseName: string; announcements: CanvasAnnouncement[] } | { error: string }> {
  try {
    await requireOwner();
    const [courseName, announcements] = await Promise.all([
      getCourseName(courseUrl, acronym),
      listAnnouncements(courseUrl, acronym),
    ]);
    return { courseName, announcements };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load announcements." };
  }
}

/** Post a new announcement to the course. */
export async function createAnnouncementAction(
  courseUrl: string,
  title: string,
  message: string,
  acronym?: string,
  // ISO 8601 time to schedule visibility; omit/empty to post immediately.
  delayedPostAt?: string
): Promise<{ announcement: CanvasAnnouncement } | { error: string }> {
  try {
    await requireOwner();
    const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt);
    return { announcement };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the announcement." };
  }
}

/** List the account Inbox conversations for the selected institution (or default). */
export async function listConversationsAction(
  acronym?: string
): Promise<{ conversations: CanvasConversationSummary[] } | { error: string }> {
  try {
    await requireOwner();
    return { conversations: await listConversations(acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the inbox." };
  }
}

/** Fetch one conversation's full thread. */
export async function getConversationAction(
  id: number,
  acronym?: string
): Promise<{ conversation: CanvasConversationDetail } | { error: string }> {
  try {
    await requireOwner();
    return { conversation: await getConversation(id, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the conversation." };
  }
}

/** Reply to a conversation, then return its refreshed thread. */
export async function replyToConversationAction(
  id: number,
  body: string,
  acronym?: string
): Promise<{ conversation: CanvasConversationDetail } | { error: string }> {
  try {
    await requireOwner();
    await replyToConversation(id, body, acronym);
    return { conversation: await getConversation(id, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the reply." };
  }
}

/** Mark a conversation read/unread or archive it. */
export async function setConversationStateAction(
  id: number,
  state: "read" | "unread" | "archived",
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await setConversationWorkflowState(id, state, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the conversation." };
  }
}

// ── Course Content (modules & pages) ─────────────────────────────────────────
//
// Owner-gated wrappers over the Canvas Modules/Pages API. Reads power the Course
// Content tab; writes mutate live course content, so the UI keeps every write
// explicit (staged locally, saved on an explicit click) and these actions simply
// pass the author's confirmed changes through.

/** Load a course's name, modules (with items), and wiki page list in one call. */
export async function listCourseContentAction(
  courseUrl: string,
  acronym?: string
): Promise<{ courseName: string; modules: CanvasModule[]; pages: CanvasPageSummary[] } | { error: string }> {
  try {
    await requireOwner();
    const [courseName, modules, pages] = await Promise.all([
      getCourseName(courseUrl, acronym),
      listModules(courseUrl, acronym),
      listPages(courseUrl, acronym),
    ]);
    return { courseName, modules, pages };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load course content." };
  }
}

// ── File upload + bulk edit ──────────────────────────────────────────────────

type BulkActionResult = { updated: number; failures: Array<{ id: string; error: string }> };

/** Step 1 of a Canvas file upload: get a pre-signed upload ticket for the browser. */
export async function requestFileUploadAction(
  courseUrl: string,
  file: { name: string; size: number; contentType?: string; folderPath?: string },
  acronym?: string
): Promise<{ ticket: FileUploadTicket } | { error: string }> {
  try {
    await requireOwner();
    return { ticket: await requestFileUpload(courseUrl, file, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the upload." };
  }
}

/** List the course's files (Files subtab). */
export async function listCourseFilesAction(
  courseUrl: string,
  acronym?: string
): Promise<{ files: CourseFile[] } | { error: string }> {
  try {
    await requireOwner();
    return { files: await listCourseFiles(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the files." };
  }
}

/** Rename a course file. */
export async function renameCourseFileAction(
  courseUrl: string,
  fileId: number,
  name: string,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await renameCourseFile(courseUrl, fileId, name, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rename the file." };
  }
}

/** Delete a course file. */
export async function deleteCourseFileAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteCourseFile(courseUrl, fileId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the file." };
  }
}

/** Attach an already-uploaded Canvas file to a module as a File item. */
export async function addFileToModuleAction(
  courseUrl: string,
  moduleId: number,
  fileId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await createModuleItem(courseUrl, moduleId, { type: "File", contentId: fileId }, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the file to the module." };
  }
}

/** List items of one kind (with published/due/points) for the bulk editor. */
export async function listBulkItemsAction(
  courseUrl: string,
  kind: BulkKind,
  acronym?: string
): Promise<{ items: BulkItem[] } | { error: string }> {
  try {
    await requireOwner();
    return { items: await listBulkItems(courseUrl, kind, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load items." };
  }
}

/** Bulk-set published and/or points possible on selected items of one kind. */
export async function bulkUpdateAction(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  fields: { published?: boolean; pointsPossible?: number },
  acronym?: string
): Promise<BulkActionResult | { error: string }> {
  try {
    await requireOwner();
    return await bulkUpdate(courseUrl, kind, ids, fields, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the items." };
  }
}

/** Bulk-delete selected items of one kind. */
export async function bulkDeleteAction(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  acronym?: string
): Promise<BulkActionResult | { error: string }> {
  try {
    await requireOwner();
    return await bulkDelete(courseUrl, kind, ids, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the items." };
  }
}

/** List the course's grading rubrics (for bulk association). */
export async function listRubricsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ rubrics: CanvasRubric[] } | { error: string }> {
  try {
    await requireOwner();
    return { rubrics: await listRubrics(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load rubrics." };
  }
}

/** Attach a rubric to many assignments. */
export async function bulkAssociateRubricAction(
  courseUrl: string,
  rubricId: number,
  assignmentIds: string[],
  acronym?: string
): Promise<BulkActionResult | { error: string }> {
  try {
    await requireOwner();
    return await bulkAssociateRubric(courseUrl, rubricId, assignmentIds, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not associate the rubric." };
  }
}

/** Create a rubric (optionally associating it to one assignment in the same call). */
export async function createRubricAction(
  courseUrl: string,
  input: {
    title: string;
    criteria: RubricCriterionInput[];
    associateAssignmentId?: number;
    useForGrading?: boolean;
  },
  acronym?: string
): Promise<{ rubric: { id: number; title: string } } | { error: string }> {
  try {
    await requireOwner();
    return { rubric: await createRubric(courseUrl, input, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the rubric." };
  }
}

/** List a classic quiz's questions for the quiz editor. */
export async function listQuizQuestionsAction(
  courseUrl: string,
  quizId: number,
  acronym?: string
): Promise<{ questions: QuizQuestion[] } | { error: string }> {
  try {
    await requireOwner();
    return { questions: await listQuizQuestions(courseUrl, quizId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the quiz questions." };
  }
}

/** Add a question to a quiz. */
export async function createQuizQuestionAction(
  courseUrl: string,
  quizId: number,
  question: QuizQuestionInput,
  acronym?: string
): Promise<{ question: QuizQuestion } | { error: string }> {
  try {
    await requireOwner();
    return { question: await createQuizQuestion(courseUrl, quizId, question, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the question." };
  }
}

/** Update one quiz question. */
export async function updateQuizQuestionAction(
  courseUrl: string,
  quizId: number,
  questionId: number,
  question: QuizQuestionInput,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateQuizQuestion(courseUrl, quizId, questionId, question, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the question." };
  }
}

/** Delete one quiz question. */
export async function deleteQuizQuestionAction(
  courseUrl: string,
  quizId: number,
  questionId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteQuizQuestion(courseUrl, quizId, questionId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the question." };
  }
}

/** Apply a batch of due-date changes to module items (the cascade scheduler). */
export async function setModuleDueDatesAction(
  courseUrl: string,
  updates: DueDateUpdate[],
  acronym?: string
): Promise<{ updated: number; failures: Array<{ contentId: number; error: string }> } | { error: string }> {
  try {
    await requireOwner();
    return await setDueDates(courseUrl, updates, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update due dates." };
  }
}

/** Fetch one assignment/quiz/discussion's title + description for inline editing. */
export async function getGradableAction(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  acronym?: string
): Promise<{ detail: GradableDetail } | { error: string }> {
  try {
    await requireOwner();
    return { detail: await getGradable(courseUrl, kind, contentId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the item." };
  }
}

/** Update one assignment/quiz/discussion's title, description, and/or points. */
export async function updateGradableAction(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  fields: { title?: string; description?: string; pointsPossible?: number },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateGradable(courseUrl, kind, contentId, fields, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the item." };
  }
}

/** Load a docx/pptx file's editable paragraphs from a module File item. */
export async function getOfficeEditableAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ name: string; kind: OfficeKind; paragraphs: OfficeParagraph[] } | { error: string }> {
  try {
    await requireOwner();
    return await getOfficeEditable(courseUrl, fileId, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the file for editing." };
  }
}

/** Apply paragraph edits to a docx/pptx file and overwrite it in Canvas. */
export async function saveOfficeEditsAction(
  courseUrl: string,
  fileId: number,
  edits: Record<string, string>,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveOfficeEdits(courseUrl, fileId, edits, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}

/** Fetch a Canvas file's previewable contents (base64 for image/PDF, else text). */
export async function previewFileAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ preview: FilePreview } | { error: string }> {
  try {
    await requireOwner();
    return { preview: await getFilePreview(courseUrl, fileId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the file." };
  }
}

/** Create a new assignment/quiz/discussion (the target of a change-type). */
export async function createGradableAction(
  courseUrl: string,
  kind: GradableKind,
  fields: { title: string; description?: string; pointsPossible?: number; dueAt?: string | null },
  acronym?: string
): Promise<{ id: number } | { error: string }> {
  try {
    await requireOwner();
    return await createGradable(courseUrl, kind, fields, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the item." };
  }
}

/** List the assignments/quizzes/discussions/files that can be added as items. */
export async function listAddableContentAction(
  courseUrl: string,
  acronym?: string
): Promise<{ content: CanvasAddableContent } | { error: string }> {
  try {
    await requireOwner();
    return { content: await listAddableContent(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load course content options." };
  }
}

/** Fetch a single page's HTML body for editing. */
export async function getPageAction(
  courseUrl: string,
  pageUrl: string,
  acronym?: string
): Promise<{ page: CanvasPage } | { error: string }> {
  try {
    await requireOwner();
    return { page: await getPage(courseUrl, pageUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the page." };
  }
}

/** Save edits to a page (title / HTML body / publish state). */
export async function updatePageAction(
  courseUrl: string,
  pageUrl: string,
  fields: { title?: string; body?: string; published?: boolean },
  acronym?: string
): Promise<{ page: CanvasPage } | { error: string }> {
  try {
    await requireOwner();
    return { page: await updatePage(courseUrl, pageUrl, fields, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the page." };
  }
}

/** Create a new wiki page. */
export async function createPageAction(
  courseUrl: string,
  fields: { title: string; body?: string; published?: boolean },
  acronym?: string
): Promise<{ page: CanvasPage } | { error: string }> {
  try {
    await requireOwner();
    return { page: await createPage(courseUrl, fields, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the page." };
  }
}

/** Delete a wiki page. */
export async function deletePageAction(
  courseUrl: string,
  pageUrl: string,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deletePage(courseUrl, pageUrl, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the page." };
  }
}

/** Create a new (empty) module. */
export async function createModuleAction(
  courseUrl: string,
  name: string,
  position?: number,
  acronym?: string
): Promise<{ module: CanvasModule } | { error: string }> {
  try {
    await requireOwner();
    return { module: await createModule(courseUrl, name, position, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the module." };
  }
}

/** Update a module's name / publish state / position. */
export async function updateModuleAction(
  courseUrl: string,
  moduleId: number,
  fields: { name?: string; published?: boolean; position?: number },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateModule(courseUrl, moduleId, fields, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the module." };
  }
}

/** Delete a module. */
export async function deleteModuleAction(
  courseUrl: string,
  moduleId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteModule(courseUrl, moduleId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the module." };
  }
}

/** Add an item to a module. */
export async function createModuleItemAction(
  courseUrl: string,
  moduleId: number,
  item: NewModuleItem,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await createModuleItem(courseUrl, moduleId, item, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the item." };
  }
}

/** Update a module item's title / indent / publish state / position / module. */
export async function updateModuleItemAction(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  fields: { title?: string; indent?: number; published?: boolean; position?: number; targetModuleId?: number },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateModuleItem(courseUrl, moduleId, itemId, fields, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the item." };
  }
}

/** Remove an item from a module. */
export async function deleteModuleItemAction(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteModuleItem(courseUrl, moduleId, itemId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the item." };
  }
}

/**
 * Revise a page's HTML body from a short instruction. Returns revised HTML the
 * author reviews/previews before saving — nothing is written to Canvas here.
 */
export async function revisePageWithAiAction(
  html: string,
  instruction: string,
  provider: LlmProvider = "gemini"
): Promise<{ html: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instruction.trim()) {
      return { error: "Describe what to change first." };
    }

    const prompt = `You are editing the HTML body of a course page in a learning management system (Canvas).

CURRENT PAGE HTML:
${html}

EDIT INSTRUCTION:
${instruction.trim()}

Apply the instruction and return the full, updated page as HTML.

Requirements:
- Return ONLY the HTML for the page body. No markdown fences, no commentary, no <html>/<head>/<body> wrapper.
- Preserve the existing structure, links, images, and formatting except where the instruction calls for a change.
- Use simple, valid HTML (p, h2, h3, ul, ol, li, a, strong, em, table). Do not add inline styles or scripts.
- Do not invent facts, dates, or links that were not present or provided.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Revision failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    // Strip a stray ```html ... ``` fence if the model wraps the output.
    let revised = result.text.trim();
    const fenced = revised.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fenced) revised = fenced[1].trim();
    if (!revised) {
      return { error: "The model returned an empty revision." };
    }
    return { html: revised };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// ── Google Calendar scheduling ──────────────────────────────────────────────

/** Whether the owner has connected Google Calendar (and can read free/busy). */
export async function getGoogleCalendarStatusAction(): Promise<
  { connected: boolean } | { error: string }
> {
  try {
    const user = await requireOwner();
    const creds = await getCredentials(user.id);
    return { connected: !!creds && !!creds.refreshToken };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check the connection." };
  }
}

/** Forget the owner's Google connection. */
export async function disconnectGoogleCalendarAction(): Promise<
  { ok: true } | { error: string }
> {
  try {
    const user = await requireOwner();
    await deleteCredentials(user.id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not disconnect Google Calendar." };
  }
}

/**
 * Find open meeting slots from the owner's Google Calendar free/busy within the
 * configured working hours, plus the real events (with titles) in that window and
 * the grid config, so the inbox can render a week-view picker that shades busy
 * time and highlights the open slots.
 */
export async function getAvailableSlotsAction(
  // Optional IANA time zone to reckon and display slots in. Omit to use the
  // account's configured zone (the default — no per-request override).
  timeZoneOverride?: string
): Promise<
  | {
      slots: string[];
      slotLabels: string[];
      events: CalendarEventBlock[];
      timeZone: string;
      workStartHour: number;
      workEndHour: number;
      slotMinutes: number;
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: "Google Calendar isn't connected. Connect it under Account > Integrations." };
    }
    const baseConfig = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || baseConfig.timeZone;
    const config = { ...baseConfig, timeZone };
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + (config.lookaheadDays + 1) * 86_400_000).toISOString();
    // Free/busy drives the open-slot math; the events list (best-effort) only
    // supplies titles for the busy blocks, so a failure there still lets you pick.
    const [busy, events] = await Promise.all([
      queryFreeBusy(token, timeMin, timeMax, config.timeZone),
      listCalendarEvents(token, timeMin, timeMax, config.timeZone).catch(() => [] as CalendarEventBlock[]),
    ]);
    const slots = computeFreeSlots(busy, config, now);
    return {
      slots,
      slotLabels: formatSlotsForReply(slots, config.timeZone, config.slotMinutes),
      events,
      timeZone: config.timeZone,
      workStartHour: config.workStartHour,
      workEndHour: config.workEndHour,
      slotMinutes: config.slotMinutes,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your availability." };
  }
}

/**
 * Remove long dashes from a generated inbox message. The account owner never
 * wants em or en dashes in a drafted reply: a dash between spaces becomes a
 * comma, and any remaining (e.g. a number range) becomes a plain hyphen.
 */
function stripLongDashes(text: string): string {
  return text.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "-");
}

/**
 * Draft a warm inbox reply that offers the given open times. Falls back to a
 * plain template if the model call fails, so the feature still works offline.
 */
export async function draftMeetingReplyAction(
  threadText: string,
  slotsISO: string[],
  provider: LlmProvider = "gemini",
  // Optional IANA zone to label the offered times in; defaults to the configured zone.
  timeZoneOverride?: string
): Promise<{ body: string } | { error: string }> {
  try {
    await requireOwner();
    if (slotsISO.length === 0) {
      return { error: "No open times to offer." };
    }
    const config = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || config.timeZone;
    const labels = formatSlotsForReply(slotsISO, timeZone, config.slotMinutes);
    const bulletedTimes = labels.map((l) => `- ${l}`).join("\n");

    const fallback = `Thanks for reaching out! I'd be glad to meet over a video call. Here are a few times that work on my end:\n\n${bulletedTimes}\n\nLet me know which one suits you and I'll send a Google Meet link.`;

    const prompt = `You are an instructor replying to a student who asked to meet over a video call.

CONVERSATION SO FAR (oldest message first):
${threadText.trim()}

AVAILABLE TIMES (offer these exact options, do not invent others):
${bulletedTimes}

Write the instructor's reply: warm and brief, confirm you're happy to meet over a video call, and list the available times as a short bulleted list exactly as given. Tell them to pick one and you'll send a Google Meet link. Output ONLY the reply text (plain text, no subject line, no salutation placeholder, no markdown headers). Never use em dashes or en dashes (the long dashes); use commas or hyphens instead.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      },
      provider
    );
    if (!result.ok || !result.text.trim()) {
      return { body: stripLongDashes(fallback) };
    }
    return { body: stripLongDashes(result.text.trim()) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft the reply." };
  }
}

/**
 * Book a 30-minute (config-length) Google Meet on the owner's primary calendar
 * at the chosen slot, returning the Meet link to paste into the reply. The
 * student is invited by email only when one is supplied (Canvas exposes names,
 * not addresses).
 */
export async function createMeetingAction(
  startISO: string,
  studentName?: string,
  studentEmail?: string,
  // Optional IANA zone for the event; defaults to the configured zone.
  timeZoneOverride?: string
): Promise<{ meetLink: string | null; htmlLink: string | null; startISO: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: "Google Calendar isn't connected. Connect it under Account > Integrations." };
    }
    const config = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || config.timeZone;
    const start = new Date(startISO);
    if (Number.isNaN(start.getTime())) {
      return { error: "That meeting time is invalid." };
    }
    const end = new Date(start.getTime() + config.slotMinutes * 60_000);
    const who = studentName?.trim() ? studentName.trim() : "student";
    const event = await createCalendarEvent(token, {
      summary: `Video call with ${who}`,
      description: "Scheduled from the Teaching Assistant inbox.",
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      timeZone,
      attendeeEmails: studentEmail?.trim() ? [studentEmail.trim()] : [],
    });
    return { meetLink: event.meetLink, htmlLink: event.htmlLink, startISO: start.toISOString() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the meeting." };
  }
}

/**
 * Classify whether the latest message in a thread is asking to schedule a live
 * meeting / video call, so the inbox can proactively surface the scheduler.
 * Fails closed (not a request) so a model hiccup never blocks the UI.
 */
export async function detectMeetingRequestAction(
  threadText: string,
  provider: LlmProvider = "gemini"
): Promise<{ isMeetingRequest: boolean; confidence: number }> {
  try {
    await requireOwner();
    if (!threadText.trim()) return { isMeetingRequest: false, confidence: 0 };

    const prompt = `Decide whether the MOST RECENT message in this conversation is asking the instructor to meet live (a video call, phone call, Zoom/Meet, office hours, or "can we talk"). A general question that does not ask to meet is not a meeting request.

CONVERSATION (oldest first):
${threadText.trim()}

Respond with ONLY a JSON object: {"isMeetingRequest": boolean, "confidence": number between 0 and 1}.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 80, responseMimeType: "application/json" },
      },
      provider
    );
    if (!result.ok) return { isMeetingRequest: false, confidence: 0 };

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return { isMeetingRequest: false, confidence: 0 };
    const parsed = JSON.parse(match[0]) as { isMeetingRequest?: unknown; confidence?: unknown };
    return {
      isMeetingRequest: parsed.isMeetingRequest === true,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return { isMeetingRequest: false, confidence: 0 };
  }
}

/**
 * Draft an announcement (title + body) from a short instruction. The author
 * reviews and edits before anything is posted.
 */
export async function draftAnnouncementAction(
  instruction: string,
  provider: LlmProvider = "gemini"
): Promise<{ title: string; message: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instruction.trim()) {
      return { error: "Describe what the announcement should say first." };
    }

    const prompt = `You are an instructor writing a course announcement for students.

WHAT TO ANNOUNCE:
${instruction.trim()}

Write a clear, warm, professional announcement. Return ONLY valid JSON:
{
  "title": "...",
  "message": "..."
}

Requirements:
- "title": a short, specific subject line (no more than ~10 words).
- "message": the announcement body, addressed directly to students. Use plain text with blank lines between paragraphs; do not use markdown, headings, or bullet symbols.
- Keep it concise and actionable. Do not invent dates, links, or details that were not provided.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Draft failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const trimmed = result.text.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse the draft from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      title?: string;
      message?: string;
    };

    return { title: (parsed.title ?? "").trim(), message: (parsed.message ?? "").trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Draft a reply to a Canvas message, given the existing thread (oldest first)
 * and an optional steer. Returns plain text the author can edit before sending.
 */
export async function draftMessageReplyAction(
  threadText: string,
  instructions: string,
  provider: LlmProvider = "gemini"
): Promise<{ body: string } | { error: string }> {
  try {
    await requireOwner();
    if (!threadText.trim()) {
      return { error: "Open a conversation before drafting a reply." };
    }

    const steer = instructions.trim()
      ? `\n\nHOW TO REPLY:\n${instructions.trim()}`
      : "";

    const prompt = `You are an instructor replying to a student's message in the Canvas inbox.

CONVERSATION SO FAR (oldest message first):
${threadText.trim()}${steer}

Write the instructor's reply. Respond directly to the most recent message, in a warm, helpful, professional tone. Output ONLY the reply text itself: plain text, no subject line, no salutation placeholder like "[Name]", no markdown. Do not invent facts, dates, grades, or links that are not present in the thread. Never use em dashes or en dashes (the long dashes); use commas or hyphens instead.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Draft failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const body = stripLongDashes(result.text.trim());
    if (!body) {
      return { error: "The model returned an empty reply." };
    }
    return { body };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// ── Live Feed (Grading) ─────────────────────────────────────────────────────

/**
 * Report, per institution acronym, whether its Canvas and grading-service env
 * vars are configured — so the Live Feed table can flag missing setup without
 * exposing any secret values.
 */
export async function checkInstitutionsAction(
  acronyms: string[]
): Promise<
  | { statuses: Array<{ acronym: string; canvasConfigured: boolean; llmConfigured: boolean }> }
  | { error: string }
> {
  try {
    await requireOwner();
    const statuses = acronyms.map((raw) => {
      const code = raw.trim().toUpperCase();
      return {
        acronym: code,
        canvasConfigured:
          !!process.env[`${code}_CANVAS_URL`] && !!process.env[`${code}_CANVAS_API_TOKEN`],
        llmConfigured: !!process.env[`${code}_LLM_URL`] && !!process.env[`${code}_LLM_API`],
      };
    });
    return { statuses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check institutions." };
  }
}

/**
 * Build the grading queue across the given institution acronyms: assignments and
 * graded discussions that currently have submissions needing grading, with their
 * description and rubric. Per-institution failures are reported, not fatal.
 */
export async function listGradingQueueAction(
  acronyms: string[]
): Promise<
  { rows: CanvasQueueItem[]; errors: Array<{ acronym: string; error: string }> } | { error: string }
> {
  try {
    await requireOwner();
    const rows: CanvasQueueItem[] = [];
    const errors: Array<{ acronym: string; error: string }> = [];
    await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return;
        try {
          rows.push(...(await listGradingQueue(code)));
        } catch (err) {
          errors.push({
            acronym: code,
            error: err instanceof Error ? err.message : "Failed to load.",
          });
        }
      })
    );
    rows.sort(
      (a, b) =>
        a.institution.localeCompare(b.institution) ||
        a.courseName.localeCompare(b.courseName) ||
        a.title.localeCompare(b.title)
    );
    return { rows, errors };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the grading queue." };
  }
}

/**
 * Per-institution notification counts for the tab + switcher badges: submissions
 * needing grading and unread inbox messages. Per-institution failures degrade to
 * 0 so one misconfigured school doesn't blank every badge.
 */
/** The user's seen assignments and unwatched courses, for filtering the feed. */
export async function listGradingDismissalsAction(): Promise<
  | {
      assignments: Array<{ institution: string; refId: string }>;
      courses: Array<{ institution: string; refId: string }>;
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const all = await listDismissals(user.id);
    return {
      assignments: all
        .filter((d) => d.scope === "assignment")
        .map((d) => ({ institution: d.institution, refId: d.refId })),
      courses: all
        .filter((d) => d.scope === "course")
        .map((d) => ({ institution: d.institution, refId: d.refId })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your grading preferences." };
  }
}

/** Mark an assignment seen (hide it from the feed/badge), or undo that. */
export async function setAssignmentSeenAction(
  institution: string,
  assignmentId: string,
  seen: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const code = institution.trim().toUpperCase();
    if (seen) await addDismissal(user.id, "assignment", code, assignmentId);
    else await removeDismissal(user.id, "assignment", code, assignmentId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the assignment." };
  }
}

/** Stop watching a course (no more notifications for it), or resume watching. */
export async function setCourseWatchedAction(
  institution: string,
  courseId: string,
  watched: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const code = institution.trim().toUpperCase();
    // "not watched" is stored as a 'course' dismissal.
    if (!watched) await addDismissal(user.id, "course", code, courseId);
    else await removeDismissal(user.id, "course", code, courseId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course." };
  }
}

export async function getInstitutionCountsAction(
  acronyms: string[]
): Promise<
  { counts: Array<{ acronym: string; needsGrading: number; unread: number }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    // Exclude assignments marked "seen" and courses the user stopped watching so
    // the badge matches the filtered Live Feed.
    const dismissals = await listDismissals(user.id);
    const assignmentsByCode = new Map<string, Set<string>>();
    const coursesByCode = new Map<string, Set<string>>();
    for (const d of dismissals) {
      const map = d.scope === "assignment" ? assignmentsByCode : coursesByCode;
      const set = map.get(d.institution) ?? new Set<string>();
      set.add(d.refId);
      map.set(d.institution, set);
    }
    const counts = await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return { acronym: code, needsGrading: 0, unread: 0 };
        const exclude = {
          courses: coursesByCode.get(code),
          assignments: assignmentsByCode.get(code),
        };
        const [needsGrading, unread] = await Promise.all([
          getNeedsGradingCount(code, exclude).catch(() => 0),
          getUnreadCount(code).catch(() => 0),
        ]);
        return { acronym: code, needsGrading, unread };
      })
    );
    return { counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load notification counts." };
  }
}

/**
 * Unread inbox counts only — cheap (one call per school), for refreshing the
 * Communications badge after read/archive without re-running the needs-grading scan.
 */
export async function getUnreadCountsAction(
  acronyms: string[]
): Promise<{ counts: Array<{ acronym: string; unread: number }> } | { error: string }> {
  try {
    await requireOwner();
    const counts = await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return { acronym: code, unread: 0 };
        const unread = await getUnreadCount(code).catch(() => 0);
        return { acronym: code, unread };
      })
    );
    return { counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load unread counts." };
  }
}

// Grade a submissions zip with the deterministic ("Other") grading service.
// Shared by the uploaded-zip path and the Canvas path (which synthesizes a zip).
async function gradeZipViaEngine(
  zipBase64: string,
  rubric: string,
  rubricFile: File | null,
  institutionCode?: string,
  // Canvas points_possible when grading from a Canvas URL; null for zip uploads.
  pointsPossible: number | null = null
): Promise<GradeActionState> {
  let rubricText = "";
  let rubricName: string | undefined;
  if (rubricFile && rubricFile.size > 0) {
    rubricText = await rubricFile.text();
    rubricName = rubricFile.name;
  } else if (rubric.trim()) {
    rubricText = rubric;
  }
  if (!rubricText.trim()) {
    return {
      run: null,
      error:
        "Provide a rubric (upload a CSV/JSON file or paste one) to grade with the deterministic grader.",
    };
  }
  const resp = await gradeViaGradingEngine(
    zipBase64,
    detectRubricSource(rubricText, rubricName),
    institutionCode
  );
  const warnings = [
    ...resp.warnings,
    ...(resp.unmapped_criteria?.length
      ? [`Excluded (unmapped): ${resp.unmapped_criteria.join(", ")}`]
      : []),
  ];
  return { run: gradingApiToRun(resp, pointsPossible), error: null, warnings };
}

export async function gradeAction(
  _prev: GradeActionState,
  formData: FormData
): Promise<GradeActionState> {
  const file = formData.get("studentSubmissions") as File | null;
  const canvasUrl = ((formData.get("canvasUrl") as string | null) ?? "").trim();
  const assignmentInstructions =
    (formData.get("assignmentInstructions") as string | null) ?? "";
  const rubric = (formData.get("rubric") as string | null) ?? "";
  const provider = normalizeProvider(formData.get("provider") as string | null);
  const rubricFile = formData.get("rubricFile") as File | null;
  // Optional institution acronym (Live Feed Auto Grade) — routes the
  // deterministic grader to that school's endpoint; blank uses the global one.
  const institution = ((formData.get("institution") as string | null) ?? "").trim() || undefined;

  try {
    await requireOwner();

    // Canvas source: grade each student's discussion posts or assignment
    // submission (kind auto-detected from the URL). Routes by provider — the
    // deterministic grader gets a synthesized zip; Gemini grades the text/files.
    if (canvasUrl) {
      // SpeedGrader base URL for per-student deep links in the results table.
      // Best-effort: a failure here must not block grading.
      const speedGraderUrl = await getSpeedGraderUrl(canvasUrl).catch(() => null);

      if (provider === "other") {
        const [{ students }, pointsPossible] = await Promise.all([
          fetchCanvasWork(canvasUrl),
          fetchAssignmentPointsPossible(canvasUrl),
        ]);
        const zipBase64 = await canvasWorkToZipBase64(students);
        const state = await gradeZipViaEngine(zipBase64, rubric, rubricFile, institution, pointsPossible);
        return state.run ? { ...state, run: { ...state.run, speedGraderUrl } } : state;
      }

      if (!assignmentInstructions.trim()) {
        return { run: null, error: "Please provide assignment instructions." };
      }
      // No rubric synthesis on the Canvas path: grade with whatever rubric was
      // retrieved from Canvas (may be empty), using the instructions otherwise.
      const [run, fullCreditChecklist] = await Promise.all([
        gradeCanvasUrl(canvasUrl, assignmentInstructions, rubric, provider),
        synthesizeFullCreditChecklist(assignmentInstructions, rubric, provider),
      ]);
      return { run: { ...run, fullCreditChecklist, speedGraderUrl }, error: null };
    }

    if (!file || file.size === 0) {
      return { run: null, error: "Please upload a student submissions zip file." };
    }

    // Deterministic Grading API path (provider toggle = "other").
    if (provider === "other") {
      const zipBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      return gradeZipViaEngine(zipBase64, rubric, rubricFile, institution);
    }

    // Gemini path.
    if (!assignmentInstructions.trim()) {
      return { run: null, error: "Please provide assignment instructions." };
    }

    const effectiveRubric = rubric.trim()
      ? rubric
      : await generateRubric(assignmentInstructions, provider);
    const generatedRubric = rubric.trim() ? undefined : effectiveRubric;

    const zipBuffer = await file.arrayBuffer();
    const [run, fullCreditChecklist] = await Promise.all([
      gradeSubmissions(zipBuffer, assignmentInstructions, effectiveRubric, provider),
      synthesizeFullCreditChecklist(assignmentInstructions, effectiveRubric, provider),
    ]);

    return {
      run: {
        ...run,
        fullCreditChecklist,
      },
      error: null,
      generatedRubric,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { run: null, error: message };
  }
}

export interface SelectionChatMessage {
  role: "user" | "model";
  text: string;
}

export async function selectionChatAction(
  selectedText: string,
  question: string,
  history: SelectionChatMessage[],
  sessionId: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    const systemPrompt = `You are a helpful teaching assistant. The user has highlighted the following text and has a question about it. Answer concisely and helpfully. Use plain prose only — do not use any markdown formatting, bold, italics, bullet points, headers, or special symbols.

HIGHLIGHTED TEXT:
"""
${selectedText}
"""`;

    const contents = [
      { role: "user" as const, parts: [{ text: systemPrompt }] },
      { role: "model" as const, parts: [{ text: "Understood. I'll answer questions about the highlighted text in plain prose with no formatting." }] },
      ...history.map((m) => ({ role: m.role as "user" | "model", parts: [{ text: m.text }] })),
      { role: "user" as const, parts: [{ text: question }] },
    ];

    const result = await callLlm(
      {
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Chat failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const replyText = result.text || "No response from the model.";

    // Log the user message and assistant reply to the database (non-blocking).
    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: session } = await supabase.auth.getUser();
      userId = session.user?.id;
    } catch {
      // Non-fatal — continue without a user ID.
    }

    void logChatExchange({
      sessionId,
      source: "selection",
      userMessage: question,
      assistantReply: replyText,
      contextText: selectedText,
      userId,
    });

    return replyText;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export interface CourseScheduleRow {
  week: number;
  dates: string;
  topics: string;
  assignment: string;
}

export interface CourseScheduleResult {
  rows: CourseScheduleRow[];
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
  numberOfWeeks: number,
  numberOfTests: number,
  provider: LlmProvider = "gemini"
): Promise<CourseScheduleResult | { error: string }> {
  try {
    if (provider === "other") {
      const resp = await courseEngineSchedule(courseDescription.trim(), numberOfWeeks);
      return { rows: scheduleResponseToRows(resp, startingDate) };
    }

    const prompt = `You are an expert curriculum designer creating a weekly course schedule.

COURSE DESCRIPTION:
${courseDescription}

TERM: ${term}
COURSE START DATE: ${startingDate}
NUMBER OF WEEKS: ${numberOfWeeks}
NUMBER OF TESTS: ${numberOfTests}

Generate a complete ${numberOfWeeks}-week course schedule. Distribute ${numberOfTests} test(s) logically across the schedule (e.g. after major topic blocks). Calculate actual date ranges for each week starting from the provided start date (Monday–Friday format, e.g. "Aug 25 – Aug 29"). Every week should have instructional content — do not include break weeks or non-instruction weeks.

Return ONLY valid JSON in this exact format:
{
  "rows": [
    { "week": 1, "dates": "...", "topics": "...", "assignment": "..." },
    ...
  ]
}

Requirements:
- Include exactly ${numberOfWeeks} rows (one per week).
- "week" is the week number (1-based integer).
- "dates" is the date range for that week (e.g. "Aug 25 – Aug 29").
- "topics" describes the main subject(s) covered that week; for test weeks include "Test${numberOfTests > 1 ? " N" : ""}" alongside the topic.
- "assignment" is a brief description of the homework or activity due that week; write "Test" for test weeks.
- Space the ${numberOfTests} test(s) evenly across the schedule, placing them at the end of major topic blocks.
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
    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse the schedule from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
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

export async function generateCopilotProjectPromptAction(
  fileContent: string,
  fileName: string,
  provider: LlmProvider = "gemini"
): Promise<{ prompt: string } | { error: string }> {
  try {
    if (provider === "other") {
      const resp = await courseEngineCopilotPrompt(fileContent, fileName);
      return resp.prompt
        ? { prompt: resp.prompt }
        : { error: "Course Engine returned an empty prompt." };
    }

    const prompt = `You are an expert software engineering educator. A teacher has provided a course schedule (as a CSV or text file) and wants to create a hands-on software project that gives students practice with every topic and assignment in the course.

FILE NAME: ${fileName}

SCHEDULE CONTENT:
${fileContent}

Your task: Write a detailed GitHub Copilot prompt that the teacher can paste into GitHub Copilot (Agent mode) to scaffold a complete software project.

Before writing the prompt, analyze the schedule to identify:
1. Which weeks are review weeks (weeks with titles like "Review", "Exam Review", "Midterm Review", etc.) and what topics from prior weeks they cover.
2. Which weeks are test/exam weeks (weeks with titles like "Midterm", "Final", "Exam", "Quiz", etc.) and what topics those assessments cover.
3. The primary programming language and domain of the course (e.g., Python → data science; JavaScript → web development; Java → enterprise/Android; R → statistics/data analysis; SQL → data engineering) so the project can showcase skills that employers in that domain commonly want.

The project must:
- Be themed around employer-relevant skills for the course's language and domain (e.g., a data science pipeline and dashboard for Python courses, a full-stack web app for JavaScript courses, an Android app for Java courses) so students can showcase the project to prospective employers
- Include a frontend (a web UI, dashboard, or interactive interface) that is part of the project repository and deployed to Vercel
- Cover every topic listed in the schedule in roughly the same order
- Reference or incorporate each assignment described in the schedule
- Be realistic and buildable by a student over the course of the term
- Use a simple tech stack that deploys to Vercel out of the box — prefer Next.js for full-stack or data-heavy courses, or a plain HTML/CSS/JavaScript static site for lighter courses. First evaluate whether the course goals can be met entirely with Next.js, Vercel, and GitHub alone (e.g., static data, local state, file-based storage, or Vercel Edge/API routes). Only introduce additional services if the course goals genuinely cannot be achieved without them (for example, if the course requires a persistent relational database, real-time data, or authentication across users). When additional services are necessary, prioritize free tiers of tools that integrate natively with Vercel and GitHub — such as Supabase (PostgreSQL database, auth, storage, and realtime, with first-class Vercel and GitHub integrations and a generous free tier) — over self-hosted or paid infrastructure. Avoid any service that requires DevOps experience, paid plans at student scale, or complex setup beyond clicking "Connect to Vercel" in a dashboard. The architecture must be something a beginner can fork, deploy, and iterate on with zero DevOps experience

Assignment structure rules — the prompt MUST specify all of the following:
- There must be an "assignment0" folder that serves as an onboarding exercise. This assignment must walk students step-by-step through: (1) forking the repository, (2) deploying the fork to Vercel and getting a live preview URL, (3) creating a new branch, (4) opening the branch in GitHub Codespaces, (5) making a simple code change (e.g., changing a variable in a designated file to their own name so their name appears in the frontend), (6) running the unit tests for assignment0 using the Testing panel in GitHub Codespaces (not the terminal), (7) committing the change using the Source Control panel in GitHub Codespaces (not the terminal), (8) pushing the branch using the Source Control panel in GitHub Codespaces (not the terminal), (9) opening a pull request using the GitHub website, (10) verifying the Vercel preview deployment on the PR, (11) merging the PR using the GitHub website. The instructions for this assignment must be in assignment0/INSTRUCTIONS.md.
- Every assignment folder (assignment0, assignment1, assignment2, …) must live inside a single root-level "assignments/" directory (e.g., assignments/assignment0/, assignments/assignment1/, etc.). No assignment folder should exist outside of this directory.
- In each assignment folder there must be exactly ONE file that students edit to complete the assignment. All other files in the folder must be read-only scaffolding. The prompt must name the file students edit.
- Each assignment folder must contain an INSTRUCTIONS.md file with verbose, beginner-friendly instructions for that assignment, including several worked examples that illustrate the concepts WITHOUT giving away the solution. Examples should use different scenarios or data than the actual assignment tasks. All instructions throughout every INSTRUCTIONS.md file must guide students to use GitHub and GitHub Codespaces graphical interfaces (e.g., the Source Control panel for committing and pushing, the Testing panel for running tests, the GitHub website for pull requests and merging) rather than terminal commands wherever possible. Any step that can be accomplished through a UI must describe how to do so through the UI and must NOT instruct students to open the terminal.
- Each assignment folder must contain unit tests (e.g., test_assignment{N}.py, assignment{N}.test.js, etc.) that verify the student's implementation. Tests must import/require only the one file the student edits.
- The assignment files must be wired into the frontend so that the very act of a student completing their one editable assignment file — and nothing else — automatically unlocks the corresponding feature on the frontend. Students must NOT need to edit any configuration files, environment variables, feature flags, or any file outside their assignment folder for the unlock to take effect. The integration must work by having the frontend directly import or dynamically read only the student's assignment file at build or runtime (for example, the frontend imports the student's module and checks whether the exported function/class returns non-trivial output, or reads a value the student set). The prompt must specify this mechanism precisely: name the exact import/read path for each assignment file, describe what the frontend checks, and show how the UI state changes when the check passes. No manual wiring step should ever be required of the student beyond completing the assignment file itself.
- Review weeks (identified from the schedule) must have their own full assignment folder named "reviewN" containing: an INSTRUCTIONS.md with review guide and study materials describing exactly which topics and assignments are covered, one editable file students complete as a review exercise, unit tests that verify the review exercise, and the same frontend-unlock wiring as regular assignments. All instructions must follow the no-terminal rule above.
- Test/exam weeks (identified from the schedule) must also have their own full assignment folder named "examN" (or "midterm", "final", etc.) containing: an INSTRUCTIONS.md that describes the topics assessed and provides a practice exercise mirroring the exam format, one editable file students complete as a practice exercise, unit tests that verify the practice exercise, and the same frontend-unlock wiring as regular assignments. The project README must also note these weeks and the topics they assess. All instructions must follow the no-terminal rule above.

The prompt you write should be self-contained — someone should be able to paste it directly into GitHub Copilot Agent mode and get a fully scaffolded project back. Be specific about: the repository's top-level file structure, each assignment folder's contents (listing every file by name), the frontend framework and how it is structured, the Vercel configuration, how assignment completion unlocks frontend features, and how the project evolves week by week to match the schedule.

Return ONLY the prompt text — no preamble, no explanation, no markdown code fences. Just the raw prompt the teacher will paste into GitHub Copilot.`;

    const llmResult = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!llmResult.ok) {
      return { error: `Prompt generation failed: HTTP ${llmResult.status} — ${llmResult.body.slice(0, 200)}` };
    }

    const generated = llmResult.text;

    if (!generated.trim()) {
      return { error: "The model did not return a prompt. Please try again." };
    }

    return { prompt: generated.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateCourseProjectRubricAction(
  fileContent: string,
  fileName: string,
  provider: LlmProvider = "gemini"
): Promise<{ rubric: string } | { error: string }> {
  try {
    const prompt = `You are an expert educator. A teacher has provided a course schedule and wants a single universal grading rubric that can be applied consistently to every assignment in the course.

FILE NAME: ${fileName}

SCHEDULE CONTENT:
${fileContent}

Based on the course schedule above, identify the overall learning goals and skills students are expected to develop across all assignments. Then create a single, course-wide grading rubric that applies fairly to every assignment regardless of topic.

The rubric must have exactly:
- 3 criteria (rows), each tied to a skill or quality that every assignment can be assessed against
- 3 performance levels (columns): Excellent, Satisfactory, Needs Improvement
- A total of exactly 100 points distributed across the 3 criteria (you may choose any reasonable point weights that sum to 100, e.g. 40/30/30 or 35/35/30)

Return ONLY valid JSON in this exact shape:
{
  "rubric": {
    "criteria": [
      {
        "name": "...",
        "points": <number>,
        "levels": {
          "excellent": { "score": <number>, "description": "..." },
          "satisfactory": { "score": <number>, "description": "..." },
          "needsImprovement": { "score": <number>, "description": "..." }
        }
      }
    ]
  }
}

Rules:
- Each criterion's "points" is the maximum points for that criterion; the three "points" values must sum to exactly 100.
- For each criterion: excellent.score == points, satisfactory.score == roughly 75% of points (round to nearest whole number), needsImprovement.score == roughly 50% of points (round to nearest whole number).
- Criteria must be broadly applicable to every assignment (e.g. "Technical Correctness", "Code Quality / Clarity", "Completeness & Requirements"). Adapt the names to match the course domain.
- Descriptions must be specific enough to be actionable but general enough to apply to any assignment in the course.
- IMPORTANT: Every criterion must evaluate only the presence or absence of things in the submitted code itself (e.g. specific functions, classes, variables, logic, structure, or required features). Do NOT include criteria that require running tests, checking commits, verifying deployments, or evaluating anything outside the code files themselves.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Rubric generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    if (!raw.trim()) {
      return { error: "The model did not return a rubric. Please try again." };
    }

    // Extract JSON
    const fencedMatch = raw.trim().match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? raw.trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse rubric from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      rubric?: {
        criteria?: Array<{
          name?: string;
          points?: number;
          levels?: {
            excellent?: { score?: number; description?: string };
            satisfactory?: { score?: number; description?: string };
            needsImprovement?: { score?: number; description?: string };
          };
        }>;
      };
    };

    const criteria = parsed.rubric?.criteria;
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return { error: "Could not parse rubric criteria from the model response." };
    }

    // Format as readable text
    const lines: string[] = ["COURSE-WIDE GRADING RUBRIC (100 points)\n"];
    lines.push(
      ["Criterion", "Excellent", "Satisfactory", "Needs Improvement"]
        .map((h) => h.padEnd(28))
        .join(" | ")
    );
    lines.push("-".repeat(110));
    for (const c of criteria) {
      const name = `${c.name ?? "Criterion"} (${c.points ?? "?"}pts)`;
      const ex = `${c.levels?.excellent?.score ?? "?"} pts — ${c.levels?.excellent?.description ?? ""}`;
      const sat = `${c.levels?.satisfactory?.score ?? "?"} pts — ${c.levels?.satisfactory?.description ?? ""}`;
      const ni = `${c.levels?.needsImprovement?.score ?? "?"} pts — ${c.levels?.needsImprovement?.description ?? ""}`;
      lines.push(`\n${name}`);
      lines.push(`  Excellent:         ${ex}`);
      lines.push(`  Satisfactory:      ${sat}`);
      lines.push(`  Needs Improvement: ${ni}`);
    }

    return { rubric: lines.join("\n") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// ── Lecture Planning ─────────────────────────────────────────────────────────

export interface AssignmentPlan {
  assignmentName: string;
  // Human-readable, unique label derived from the folder slug (e.g. "Review 1",
  // "Assignment 3"). Used for file names and the editor header so two folders
  // with the same number (assignment1 / review1 / exam1) never collide.
  label: string;
  presentationTitle: string;
  slides: SlideData[];
  // True when slide generation failed for this assignment after retries, so the
  // deck above is an empty placeholder. The UI surfaces this so the instructor
  // can regenerate rather than silently shipping a blank deck.
  slidesFailed?: boolean;
  moduleIntroduction: string;
  assignmentInstructions: string;
  // The week number parsed from the assignment folder name in the codebase
  // (e.g. "week3" -> 3). Falls back to the assignment's position in the sorted
  // list when the folder name contains no number.
  weekNumber: number;
  // The exact heading lines found in the supplied templates (paragraphs styled
  // as headings/titles in the .docx). When a template is provided, only these
  // lines may receive heading formatting in the generated document — body text
  // must never be promoted to a heading. Empty when no template was supplied.
  introTemplateHeadings: string[];
  instructionsTemplateHeadings: string[];
}

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


function buildStrictTemplateBlock(templateText: string): string {
  if (!templateText.trim()) return "";
  return `\n\nSTRICT TEMPLATE TO FOLLOW (this takes ABSOLUTE PRECEDENCE over every other structural instruction in this prompt):\n${templateText}\n\nTEMPLATE RULES (mandatory):\n- Reproduce the template's exact section headings, wording of headings, and their order. Do not add, remove, rename, merge, split, or reorder any section.\n- Match the template's formatting, heading style, capitalization, numbering/bullet conventions, tone, and overall structure precisely.\n- The template marks bulleted list items with a leading "- " and numbered list items with a leading "1. ", "2. ", etc. Wherever the template uses these list markers, your output MUST use the same list markers (start each such line with "- " for bullets or "N. " for numbered items). Wherever the template uses ordinary paragraphs, keep them as paragraphs with no list marker.\n- Replace any placeholder text in the template (e.g. bracketed prompts, sample text, "TODO", "[...]") with real content tailored to this assignment.\n- Preserve any fixed/boilerplate wording in the template verbatim.\n- If a default section described elsewhere in this prompt is not present in the template, only include it if the template has a clearly appropriate place for it; otherwise omit it. The template's structure wins in every conflict.`;
}

async function generateSlidesForAssignment(
  assignmentName: string,
  content: string,
  lectureDurationMinutes: number,
  provider: LlmProvider
): Promise<{ presentationTitle: string; slides: SlideData[] } | { error: string }> {
  const prompt = `You are an expert educator creating a lecture slide deck for a programming course assignment. The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

ASSIGNMENT: ${assignmentName}
LECTURE DURATION: ${lectureDurationMinutes} minutes

ASSIGNMENT CONTENT:
${content}

Based on the assignment content above, create a complete lecture slide deck that teaches students the concepts they need to understand and complete this assignment. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).

Return ONLY valid JSON:
{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."] },
    { "title": "Case Study: ...", "bullets": ["...", "...", "..."] },
    { "title": "Example: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Walkthrough: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" },
    { "title": "Practice: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" }
  ]
}

Requirements:
- Each slide must have a "title" and a "bullets" array.
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters for the assignment. Never use bare keywords or vague one-liners — write as if the student is reading the slide alone with no instructor present.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- The SECOND slide MUST be a real-world case study or news story about this lecture's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event (the organization or product involved and roughly when it happened). Prefer a dramatic, motivating story — a high-profile failure, security breach, or outage, OR an impressive system that was built — to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Do not put "code" on this slide. Stick to established facts; never invent events or fabricate specifics.
- Cover the concepts introduced in the README or assignment description, highlight what students must implement, and explain any relevant patterns shown in the unit tests or code comments.
- Use real-world analogies and concrete examples that students will recognise; integrate the analogy into the bullet itself so it is self-contained.
- For every concept-focused slide, immediately follow it with a concrete example slide and a step-by-step walkthrough slide that explains each step or line in plain English so the student understands the reasoning without needing the instructor to narrate it. Label these slides clearly (e.g. "Example: <concept>" and "Walkthrough: <concept>").
- CODING CONCEPTS: When the concept being introduced is a coding concept (a loop, conditional, variable, function, class, data structure, etc.), follow it with exactly these four slides, in this order:
  1. Example slide — "title" begins with "Example:"; demonstrate that exact concept with a short, correct, self-contained snippet in "code" (use real newlines) and "codeLanguage" set; keep "bullets" to at most one short caption.
  2. Walkthrough slide — "title" begins with "Walkthrough:"; explain the example code line by line in "bullets" while showing the same code in the "code" field; use the exact code from the Example slide so students can read both the code and the explanation together.
  3. Practice slide — "title" begins with "Practice:"; pose a simple, self-contained coding challenge on the same concept for the student to attempt. State the task in 1-2 "bullets" and set "codeLanguage". Its "code" field MUST repeat the SAME reference code shown on the Example/Walkthrough slide so the student has a worked example to reference — it must NOT contain the solution to the practice challenge or any code that gives away the answer.
  4. Answer slide — "title" begins with "Answer:"; give the correct, runnable solution to that exact practice challenge in "code" with "codeLanguage" set, plus at most one "bullets" caption.
- All of Example, Walkthrough, Practice, and Answer slides must include "code"/"codeLanguage". Do not omit "code" on Walkthrough or Practice slides. Omit code only on conceptual slides.
- Do not include any text outside the JSON object.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for "${assignmentName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  const raw = result.text;
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { error: `Could not parse slide data for "${assignmentName}".` };
  }

  const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
    presentationTitle?: string;
    slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
  };

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    return { error: `Model did not return a valid slides array for "${assignmentName}".` };
  }

  let slides: SlideData[] = parsed.slides
    .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
    .map((s) => toSlideData(s, 4));

  slides = propagateExampleCodeToFollowups(slides);

  return {
    presentationTitle: parsed.presentationTitle ?? assignmentName,
    slides,
  };
}

async function generateModuleIntroForAssignment(
  assignmentName: string,
  displayTitle: string,
  content: string,
  templateText = "",
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  const prompt = `You are an expert educator writing a module introduction document for a programming course.

ASSIGNMENT / MODULE: ${displayTitle}

ASSIGNMENT CONTENT:
${content}

Write a well-formatted module introduction for the week this assignment covers. The document should:
1. Start with a single document title on the very first line, written exactly as the markdown level-1 heading "# Module Introduction: ${displayTitle}". This must be the only level-1 heading in the document. Never use folder names, file paths, or identifiers like "review1" or "assignment3" as the title or any heading.
2. Open with an engaging overview of the topic and why it matters.
3. Include a section called "Real-World Applications" with at least 3 concrete, specific examples of how these concepts or technologies are used in real software, industry products, or everyday technology that students will recognise (e.g., how the concept powers a well-known app, framework, or system).
4. Include a brief section called "What You Will Learn" that lists the key skills and concepts students will gain.
5. Be written in clear, motivating language appropriate for undergraduate students.
6. Format every section heading (other than the document title) as a markdown level-2 heading (e.g. "## Real-World Applications"). Do not use any other markdown symbols (no bold, italics, or bullet asterisks) in the body text.

Do not include the assignment instructions or grading criteria — focus only on introducing the module topic.${buildStrictTemplateBlock(templateText)}`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for module intro "${assignmentName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  const text = result.text;

  if (!text.trim()) {
    return { error: `Module intro generation returned empty response for "${assignmentName}".` };
  }

  return { text: text.trim() };
}

async function generateAssignmentInstructionsForAssignment(
  assignmentName: string,
  displayTitle: string,
  readmeContent: string,
  templateText = "",
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  const prompt = `You are an expert educator writing a formal assignment instruction sheet for a programming course.

ASSIGNMENT: ${displayTitle}

README / ASSIGNMENT SOURCE:
${readmeContent}

Using the README content above, write a complete, student-facing assignment instruction document. The document should:
1. Start with the document title on the very first line, written exactly as the markdown level-1 heading "# ${displayTitle}". This must be the only level-1 heading. Never use folder names, file paths, or identifiers like "review1" or "assignment3" as the title or any heading.
2. Include an "Assignment Overview" section that clearly states the purpose and learning objectives.
3. Include a "Instructions" section that details exactly what students must do, broken into bulleted steps or tasks pulled from the README (each step on its own line starting with "- ").
4. Include a "Requirements" section listing any technical or functional requirements mentioned in the README (e.g., methods to implement, expected behaviour, constraints).
5. Include a "Helpful Free Resources" section with at least 5 free external resources (tutorials, official documentation, guides, or reference material) that help students complete this assignment. For each resource, give the title, the URL, and one short sentence on why it helps. Every resource must be freely accessible (no paywalls) and come from a reputable source (e.g. official docs, MDN, Python docs, freeCodeCamp, Microsoft Learn, university or open course material).
6. End with a "Deliverables" section. The deliverable is ALWAYS: submit the up-to-date zip of the entire codebase with all completed files included.
7. Format every section heading (other than the document title) as a markdown level-2 heading (e.g. "## Instructions"). For any list, start each item on its own line with a hyphen ("- "); NEVER use numbered lists (no "1.", "2.", etc.). Do not use any other markdown symbols (no bold or italics) in the body text.
8. Write in clear, direct language appropriate for undergraduate students.

Do not invent requirements not present in the README. If the README is sparse, note that students should contact the instructor (for example during office hours) for clarification. Never tell students to use, post on, check, or refer to a course discussion board, forum, or message board anywhere in the document. The "Helpful Free Resources" section should always be included regardless of how sparse the README is.${buildStrictTemplateBlock(templateText)}`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for assignment instructions "${assignmentName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  const text = result.text;

  if (!text.trim()) {
    return { error: `Assignment instructions generation returned empty response for "${assignmentName}".` };
  }

  return { text: text.trim() };
}

export async function generateCourseRubricFromZipAction(
  zipBase64: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  const TEXT_EXTENSIONS = new Set([
    ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c",
    ".h", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".r", ".sql",
    ".sh", ".yaml", ".yml", ".json", ".html", ".css", ".scss",
  ]);

  const ASSIGNMENTS_PATTERN = /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;
  const MAX_FILE_CHARS = 3000;

  try {
    const JSZip = (await import("jszip")).default;
    const buffer = Buffer.from(zipBase64, "base64");
    const zip = await JSZip.loadAsync(buffer);

    const allPaths = Object.keys(zip.files);

    const topFolders = new Set<string>();
    for (const path of allPaths) {
      const m = path.match(/^([^/]+)\//);
      if (m) topFolders.add(m[1]);
    }

    let assignmentsPrefix = "";
    for (const folder of topFolders) {
      if (ASSIGNMENTS_PATTERN.test(folder)) {
        assignmentsPrefix = folder + "/";
        break;
      }
    }

    if (!assignmentsPrefix) {
      for (const path of allPaths) {
        const m = path.match(/^[^/]+\/([^/]+)\//);
        if (m && ASSIGNMENTS_PATTERN.test(m[1])) {
          const firstSlash = path.indexOf("/");
          const secondSlash = path.indexOf("/", firstSlash + 1);
          if (firstSlash !== -1 && secondSlash !== -1) {
            assignmentsPrefix = path.slice(0, secondSlash + 1);
            break;
          }
        }
      }
    }

    if (!assignmentsPrefix) {
      return {
        error: "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const assignmentFolders = new Set<string>();
    for (const path of allPaths) {
      if (path.startsWith(assignmentsPrefix)) {
        const relative = path.slice(assignmentsPrefix.length);
        const parts = relative.split("/");
        if (parts.length >= 2 && parts[0]) {
          assignmentFolders.add(parts[0]);
        }
      }
    }

    if (assignmentFolders.size === 0) {
      return { error: "No assignment subfolders found inside the assignments folder." };
    }

    // Collect the README/instructions from every assignment
    const aggregatedInstructions: string[] = [];

    for (const folder of Array.from(assignmentFolders).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    )) {
      const folderPrefix = assignmentsPrefix + folder + "/";
      const folderFiles = allPaths.filter((p) => p.startsWith(folderPrefix) && !zip.files[p].dir);

      const mdFiles = folderFiles.filter((p) => p.toLowerCase().endsWith(".md"));
      const readmeFile =
        mdFiles.find((p) => p.slice(folderPrefix.length).toLowerCase().startsWith("readme")) ??
        mdFiles[0];

      if (readmeFile) {
        try {
          let content = await zip.files[readmeFile].async("string");
          if (content.length > MAX_FILE_CHARS) {
            content = content.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
          }
          if (content.trim()) {
            aggregatedInstructions.push(`=== ${folder} ===\n${content.trim()}`);
          }
        } catch {
          // skip unreadable file
        }
      } else {
        // Fall back to any text file in the folder
        const textFiles = folderFiles.filter((p) => {
          const ext = p.includes(".") ? "." + p.split(".").pop()!.toLowerCase() : "";
          return TEXT_EXTENSIONS.has(ext);
        });
        for (const filePath of textFiles.slice(0, 2)) {
          try {
            let content = await zip.files[filePath].async("string");
            if (content.length > MAX_FILE_CHARS) {
              content = content.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
            }
            if (content.trim()) {
              aggregatedInstructions.push(`=== ${folder} ===\n${content.trim()}`);
              break;
            }
          } catch {
            // skip
          }
        }
      }
    }

    if (aggregatedInstructions.length === 0) {
      return { error: "No readable assignment instructions found in the uploaded zip." };
    }

    const aggregatedText = aggregatedInstructions.join("\n\n");
    return await generateRubric(aggregatedText, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
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

    const trimmed = result.text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse slides from the model response." };
    }
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
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

/**
 * Map over `items` running at most `limit` tasks concurrently, preserving order.
 * The lecture-plan generator makes three LLM calls per assignment; without a cap
 * a large course fires dozens of Gemini requests at once and trips the per-minute
 * rate limit, which (before retries existed) silently dropped whole assignments.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    for (let current = next++; current < items.length; current = next++) {
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Shared course-zip parsing ────────────────────────────────────────────────
// The zip-based course tools (rubric, "generate all" plans, "generate one"
// module) all locate an assignments folder, enumerate its subfolders, and pull
// each one's lecture-relevant text the same way. These helpers are the single
// source of truth so every path reads a codebase zip identically.

const ASSIGNMENTS_FOLDER_PATTERN =
  /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;

const COURSE_TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c",
  ".h", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".r", ".sql",
  ".sh", ".yaml", ".yml", ".json", ".html", ".css", ".scss",
]);

const ASSIGNMENT_MAX_FILE_CHARS = 3000;
const ASSIGNMENT_MAX_TOTAL_CHARS = 12000;

interface AssignmentContentBundle {
  name: string;
  content: string;
  readmeContent: string;
}

interface LectureTemplates {
  introTemplateText: string;
  instructionsTemplateText: string;
  introTemplateHeadings: string[];
  instructionsTemplateHeadings: string[];
}

/**
 * Locate the assignments folder in a course zip: a top-level folder matching
 * ASSIGNMENTS_FOLDER_PATTERN, or one level deep when the zip wraps the repo in a
 * root folder. Returns the prefix (with trailing slash) or "" when none exists.
 */
function findAssignmentsPrefix(allPaths: string[]): string {
  const topFolders = new Set<string>();
  for (const path of allPaths) {
    const m = path.match(/^([^/]+)\//);
    if (m) topFolders.add(m[1]);
  }
  for (const folder of topFolders) {
    if (ASSIGNMENTS_FOLDER_PATTERN.test(folder)) return folder + "/";
  }
  // Try one level deep (zip may wrap the repo in a root folder).
  for (const path of allPaths) {
    const m = path.match(/^[^/]+\/([^/]+)\//);
    if (m && ASSIGNMENTS_FOLDER_PATTERN.test(m[1])) {
      const firstSlash = path.indexOf("/");
      const secondSlash = path.indexOf("/", firstSlash + 1);
      if (firstSlash !== -1 && secondSlash !== -1) {
        return path.slice(0, secondSlash + 1);
      }
    }
  }
  return "";
}

/**
 * List the assignment subfolder slugs under `prefix`, sorted numerically so
 * "assignment2" precedes "assignment10".
 */
function listAssignmentFolders(allPaths: string[], prefix: string): string[] {
  const folders = new Set<string>();
  for (const path of allPaths) {
    if (path.startsWith(prefix)) {
      const parts = path.slice(prefix.length).split("/");
      if (parts.length >= 2 && parts[0]) folders.add(parts[0]);
    }
  }
  return Array.from(folders).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

/**
 * Pull the lecture-relevant text (instructions, then tests, then other source)
 * for a single assignment folder, truncated to stay within the model's context
 * window. Returns null when the folder holds no readable text.
 */
async function extractAssignmentContentBundle(
  zip: JSZip,
  allPaths: string[],
  prefix: string,
  folder: string
): Promise<AssignmentContentBundle | null> {
  const folderPrefix = prefix + folder + "/";
  const folderFiles = allPaths.filter((p) => p.startsWith(folderPrefix) && !zip.files[p].dir);

  const mdFiles = folderFiles.filter((p) => p.toLowerCase().endsWith(".md"));
  const testFiles = folderFiles.filter((p) => {
    const name = p.toLowerCase();
    return (name.includes("test") || name.includes("spec")) && !p.toLowerCase().endsWith(".md");
  });
  const otherFiles = folderFiles.filter((p) => {
    const ext = p.includes(".") ? "." + p.split(".").pop()!.toLowerCase() : "";
    const name = p.toLowerCase();
    return (
      COURSE_TEXT_EXTENSIONS.has(ext) &&
      !p.toLowerCase().endsWith(".md") &&
      !name.includes("test") &&
      !name.includes("spec")
    );
  });

  const orderedFiles = [...mdFiles, ...testFiles, ...otherFiles];
  let content = "";
  let totalChars = 0;

  for (const filePath of orderedFiles) {
    if (totalChars >= ASSIGNMENT_MAX_TOTAL_CHARS) break;
    const ext = filePath.includes(".") ? "." + filePath.split(".").pop()!.toLowerCase() : "";
    if (!COURSE_TEXT_EXTENSIONS.has(ext)) continue;

    try {
      let fileContent = await zip.files[filePath].async("string");
      const fileName = filePath.slice(folderPrefix.length);
      if (fileContent.length > ASSIGNMENT_MAX_FILE_CHARS) {
        fileContent = fileContent.slice(0, ASSIGNMENT_MAX_FILE_CHARS) + "\n… (truncated)";
      }
      content += `\n\n=== ${fileName} ===\n${fileContent}`;
      totalChars += fileContent.length;
    } catch {
      // skip unreadable / binary files
    }
  }

  if (!content.trim()) return null;

  // Extract README content specifically for assignment instructions.
  const readmeFile =
    mdFiles.find((p) => p.slice(folderPrefix.length).toLowerCase().startsWith("readme")) ??
    mdFiles[0];
  let readmeContent = "";
  if (readmeFile) {
    try {
      readmeContent = await zip.files[readmeFile].async("string");
      if (readmeContent.length > ASSIGNMENT_MAX_FILE_CHARS) {
        readmeContent = readmeContent.slice(0, ASSIGNMENT_MAX_FILE_CHARS) + "\n… (truncated)";
      }
    } catch {
      // fall back to full content
    }
  }

  return { name: folder, content, readmeContent: readmeContent || content };
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

/**
 * Generate the full module (slides + module intro + assignment instructions) for
 * one assignment from its extracted content. Shared by the "generate all" and
 * "generate one" paths so output format and failure handling stay identical.
 */
async function buildAssignmentPlan(
  bundle: AssignmentContentBundle,
  index: number,
  lectureDurationMinutes: number,
  templates: LectureTemplates,
  provider: LlmProvider
): Promise<AssignmentPlan> {
  const { name, content, readmeContent } = bundle;

  // Map the folder slug to a clean human title/label. Strip a machine-slug
  // prefix from the source H1 (e.g. "# review1: Review: Fundamentals" ->
  // "Review: Fundamentals"); fall back to a humanized folder label. Clean the
  // README the model sees so it can't echo the slug back as the title.
  const sourceH1 = readmeContent.match(/^[ \t]*#[ \t]+(.+)$/m)?.[1]?.trim() ?? "";
  const label = humanizeAssignmentName(name);
  const strippedH1 = stripAssignmentSlugPrefix(sourceH1, name);
  const displayTitle = strippedH1 && !looksLikeAssignmentSlug(strippedH1) ? strippedH1 : label;
  const cleanedReadme = sourceH1
    ? readmeContent.replace(/^[ \t]*#[ \t]+.+$/m, `# ${displayTitle}`)
    : readmeContent;

  const [slidesResult, introResult, instructionsResult] = await Promise.all([
    generateSlidesForAssignment(name, content, lectureDurationMinutes, provider),
    generateModuleIntroForAssignment(name, displayTitle, content, templates.introTemplateText, provider),
    generateAssignmentInstructionsForAssignment(name, displayTitle, cleanedReadme, templates.instructionsTemplateText, provider),
  ]);

  // Never drop the whole assignment when only the slide deck fails — that
  // silently removed an assignment from the output with no feedback. Keep the
  // assignment (its intro/instructions are usually fine) with an empty deck so
  // it stays visible and can be regenerated.
  const slidesFailed = "error" in slidesResult;
  if (slidesFailed) {
    console.error(`Slide generation failed for "${name}": ${slidesResult.error}`);
  }
  const slides = slidesFailed ? [] : slidesResult.slides;

  // Derive the week number from the assignment folder name (e.g. "week3",
  // "Week 3", "assignment-03"). Fall back to the supplied position. Only used
  // for ordering now — file names use the unique label.
  const parsedWeek = name.match(/\d+/)?.[0];
  const weekNumber = parsedWeek ? parseInt(parsedWeek, 10) : index + 1;

  return {
    assignmentName: name,
    slides,
    slidesFailed,
    // Use the clean human title for the deck.
    presentationTitle: displayTitle,
    label,
    moduleIntroduction: "error" in introResult ? "" : introResult.text,
    assignmentInstructions: "error" in instructionsResult ? "" : instructionsResult.text,
    weekNumber,
    introTemplateHeadings: templates.introTemplateHeadings,
    instructionsTemplateHeadings: templates.instructionsTemplateHeadings,
  } satisfies AssignmentPlan;
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

    return { folders: folders.map((slug) => ({ slug, label: humanizeAssignmentName(slug) })) };
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
    return await buildAssignmentPlan(bundle, index, lectureDurationMinutes, templates, provider);
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
