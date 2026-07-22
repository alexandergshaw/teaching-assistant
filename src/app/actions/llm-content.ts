"use server";

import type { SlideData, GenerateLessonPlanResult, AssignmentData, ModuleIntroData, ExampleItem, ExamplesData, TestGeminiState, SelectionChatMessage, ScheduleWeekPlan } from "../actions-types";
import { extractSubmissions, generateRubric } from "@/lib/grade";
import { scaffoldModuleIntro, scaffoldAssignment } from "@/lib/embedded/content";
import { scaffoldLessonPlan, scaffoldExamples } from "@/lib/embedded/deck";
import { scaffoldDocument } from "@/lib/embedded/docs";
import { scaffoldCopilotPrompt } from "@/lib/embedded/course";
import { routeRequest } from "@/lib/embedded/router";
import { applySlidesRevision, applyHtmlRevision } from "@/lib/embedded/revise";
import { callLlm, normalizeProvider, type LlmProvider, type LlmPart } from "@/lib/llm";
import { filesToLlmParts } from "@/lib/llm-files";
import { courseEngineCopilotPrompt } from "@/lib/course-engine";
import { createClient } from "@/lib/supabase/server";
import { logChatExchange } from "@/lib/supabase/chat-logs";
import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock, jsonObjectSlice, mapWithConcurrency, propagateExampleCodeToFollowups, toSlideData } from "./shared";





export async function generateModuleIntroAction(
  moduleObjectives: string,
  contextText: string,
  provider: LlmProvider = "gemini"
): Promise<ModuleIntroData | { error: string }> {
  try {
    // Embedded Deterministic Engine: template the intro from the objectives with
    // no model call.
    if (provider === "embedded") {
      return scaffoldModuleIntro(moduleObjectives, contextText);
    }

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

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse module intro from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
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
    // Embedded Deterministic Engine: template a deck outline from the objectives
    // with no model call. A revision request applies concrete edit commands by
    // rule (remove/add/rename slides, replace, shorten); an unparseable one keeps
    // the current slides unchanged.
    if (provider === "embedded") {
      if (revisionPrompt && currentSlides) {
        return {
          presentationTitle: "Lesson Plan",
          slides: applySlidesRevision(currentSlides, revisionPrompt).slides,
        };
      }
      return scaffoldLessonPlan(moduleObjectives, contextText);
    }

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
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Additional Practice: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Documentation: Key Concepts", "bullets": ["...", "..."] },
    { "title": "Documentation & References", "bullets": ["...", "..."] }
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
- All of Example, Walkthrough, Practice, and Answer slides must include "code"/"codeLanguage". Do not omit "code" on Walkthrough or Practice slides. If the module teaches no programming, omit code fields and the Example/Walkthrough/Practice/Answer slides entirely.
- CLOSING SECTIONS: after all the coverage slides above, ALWAYS append these closing sections at the very END of the deck, in this exact order:
  A. ADDITIONAL PRACTICE: for EACH coding concept you introduced in this deck, add 2-3 NEW slides whose "title" begins with "Additional Practice:" that pose fresh, self-contained challenges on that concept (clearly different from the earlier inline Practice slide). IMMEDIATELY follow each "Additional Practice:" slide with its own "Answer:" slide giving the correct, runnable solution in "code" with "codeLanguage" set. The "Additional Practice:" slide states the task in its bullets and must NOT reveal the solution (it may include a short reference/starter snippet in "code", but never the answer). For a non-programming module, make these 2-3 additional conceptual practice questions per concept, each followed by an "Answer:" slide, with no code fields.
  B. DOCUMENTATION - KEY CONCEPTS: one or more slides whose "title" begins with "Documentation:" that recap the key concepts, terms, and syntax taught in this deck as a concise study reference the student can revise from (use bullets; short code snippets are allowed).
  C. DOCUMENTATION AND REFERENCES: a final slide titled exactly "Documentation & References" that lists authoritative resources for the topics: name the official documentation for each language, library, or tool used, plus 2-4 suggested further-reading resources. Name only real, well-known resources (official language/library documentation, MDN, the tool's own docs); do NOT fabricate specific URLs or invent facts.${homeworkRequirement}
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
        generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `LLM API error: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse slide data from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
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
    // Embedded Deterministic Engine: template the assignment from the objectives
    // with no model call (attached files are not read in this mode).
    if (provider === "embedded") {
      return scaffoldAssignment(moduleObjectives, contextText);
    }

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

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse assignment data from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
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


export async function generateExamplesAction(
  moduleObjectives: string,
  contextText: string,
  slides: SlideData[],
  provider: LlmProvider = "gemini"
): Promise<ExamplesData | { error: string }> {
  try {
    // Embedded Deterministic Engine: build typed example placeholders per concept
    // with no model call (worked solutions are left for the instructor).
    if (provider === "embedded") {
      return scaffoldExamples(slides.map((s) => s.title), `${moduleObjectives}\n${contextText}`);
    }

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

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse examples from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
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

/** Analyze multiple courses for emerging technology opportunities and integration recommendations. */
export async function analyzeCourseTechAction(
  courses: Array<{
    name: string;
    topics: string;
    syllabusText: string;
    textbook: string;
    repoDigest: string;
    modulesSummary: string;
    assignmentsSummary: string;
  }>,
  provider: LlmProvider = "gemini"
): Promise<{ reports: Array<{ name: string; report: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (courses.length === 0) {
      return { error: "Pick at least one course." };
    }

    const ANALYSIS_CONCURRENCY = 2;
    const reports = await mapWithConcurrency(courses, ANALYSIS_CONCURRENCY, async (course) => {
      const prompt = `You are an expert in CS and technology education. Analyze this course and provide actionable guidance on emerging technologies and integration strategies.

COURSE: ${course.name}
TOPICS: ${course.topics.slice(0, 4000)}
SYLLABUS: ${course.syllabusText.slice(0, 4000)}
TEXTBOOK/MATERIALS: ${course.textbook.slice(0, 4000)}
CODE REPOSITORY: ${course.repoDigest.slice(0, 4000)}
MODULES: ${course.modulesSummary.slice(0, 4000)}
ASSIGNMENTS: ${course.assignmentsSummary.slice(0, 4000)}

Provide a plain-text report with exactly two headed sections:

1. EMERGING TECHNOLOGY OPPORTUNITIES
   - List specific technologies/tools now relevant to students of this subject.
   - For each, explain in one line why it matters for this course's students.

2. INTEGRATION RECOMMENDATIONS
   - Provide concrete, course-specific ways to fold each technology into modules or assignments.
   - Be practical and specific to the content you reviewed above.

Return only the plain-text report with these two sections. No JSON, no markdown formatting, no code fences.`;

      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
        },
        provider
      );

      if (!result.ok) {
        return {
          name: course.name,
          report: `Analysis failed: HTTP ${result.status}`,
        };
      }

      return {
        name: course.name,
        report: result.text.trim(),
      };
    });

    return { reports };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not analyze the courses." };
  }
}

/** Draft an assignment description for the LMS editor. */
export async function draftAssignmentDescriptionAction(
  name: string,
  notes: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!name.trim()) return { error: "Name the assignment first." };
    const parts: LlmPart[] = [
      {
        text: [
          `Write a Canvas assignment description for an assignment named: ${name.trim()}.`,
          notes.trim() ? `Instructor notes to incorporate:\n${notes.trim()}` : "",
          "Structure: one short overview paragraph, then a short list of concrete requirements/steps, then a one-line submission note. Plain text only (no markdown headings, no asterisks) - use blank lines between sections and hyphen bullets. Under 220 words.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } },
      provider
    );
    if (!r.ok || !r.text.trim()) return { error: "The model returned no description." };
    return { text: r.text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft the description." };
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

    // Embedded Deterministic Engine: apply concrete edit commands (find/replace,
    // remove an element containing a phrase) by rule; an instruction the engine
    // cannot parse leaves the page unchanged rather than fabricating edits.
    if (provider === "embedded") {
      return { html: applyHtmlRevision(html, instruction).html };
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

/**
 * Generate a course document's content as clean, markdown-ish plain text suited
 * to buildDocxFromPlainText (a "# Title" line, "## Section" headings, "- " bullet
 * lists, and paragraphs). Used by "Add to each" to produce a branded .docx file.
 */
export async function generateDocumentTextAction(
  prompt: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!prompt.trim()) {
      return { error: "Describe the document to generate first." };
    }

    // Embedded Deterministic Engine: template a markdown document from the prompt
    // with no model call.
    if (provider === "embedded") {
      return { text: scaffoldDocument(prompt) };
    }

    const styleBlock = await getWritingStyleBlock(user.id);

    const llmPrompt = `You are writing a polished course handout/document for students.

TOPIC / INSTRUCTION:
${prompt.trim()}

Write the document as clean plain text using this lightweight markdown:
- The first line is the document title, prefixed with a single "# ".
- Major sections use "## " headings.
- Use "- " for bullet points.
- Separate paragraphs with a blank line.

Requirements:
- Return ONLY the document text. No code fences, no commentary, no HTML.
- Be clear, well-organized, and professional.
- Do not invent specific facts, dates, names, or links that were not provided.${styleBlock}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    // Strip a stray ``` fence if the model wraps the output.
    let text = result.text.trim();
    const fenced = text.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();
    if (!text) {
      return { error: "The model returned an empty document." };
    }
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}


export async function selectionChatAction(
  selectedText: string,
  question: string,
  history: SelectionChatMessage[],
  sessionId: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    // Embedded Deterministic Engine: the ask-anything router handles the
    // request with the highlighted text as primary context — Q&A over the
    // selection (with conversational follow-ups and glossary-backed
    // definitions), plus every other intent (rubric, quiz on the selection,
    // practice problems, case study, announcement). No model call, no external
    // web. The exchange is logged the same way as the LLM path.
    if (provider === "embedded") {
      const replyText = (await routeRequest(question, history, { contextText: selectedText })).reply;
      let embeddedUserId: string | undefined;
      try {
        const supabase = await createClient();
        const { data: session } = await supabase.auth.getUser();
        embeddedUserId = session.user?.id;
      } catch {
        // Non-fatal — continue without a user ID.
      }
      void logChatExchange({
        sessionId,
        source: "selection",
        userMessage: question,
        assistantReply: replyText,
        contextText: selectedText,
        userId: embeddedUserId,
      });
      return replyText;
    }

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

    // Embedded Deterministic Engine: template a Copilot prompt from the schedule
    // with no model call.
    if (provider === "embedded") {
      return { prompt: scaffoldCopilotPrompt(fileContent, fileName) };
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
 * Generate a course rubric from course description and schedule (used when
 * no repository is available). Returns the rubric text or an error.
 */
export async function generateCourseRubricFromScheduleAction(
  courseDescription: string,
  scheduleJson: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    await requireOwner();

    const { buildRubricSourceFromSchedule } = await import("@/app/utils/rubric");

    let schedule: ScheduleWeekPlan[] = [];
    try {
      const parsed = JSON.parse(scheduleJson);
      if (Array.isArray(parsed)) {
        schedule = parsed;
      }
    } catch {
      // Tolerate invalid/empty JSON by treating it as no schedule
    }

    const sourceText = buildRubricSourceFromSchedule(courseDescription, schedule);

    if (!sourceText.trim()) {
      return { error: "No course description or schedule provided to generate the rubric from." };
    }

    return await generateRubric(sourceText, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
