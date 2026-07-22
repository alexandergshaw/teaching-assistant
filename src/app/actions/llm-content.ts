"use server";

import type { SlideData, GenerateLessonPlanResult, AssignmentData, ModuleIntroData, ExampleItem, ExamplesData, TestGeminiState } from "../actions-types";
import { extractSubmissions, generateRubric } from "@/lib/grade";
import { scaffoldModuleIntro, scaffoldAssignment } from "@/lib/embedded/content";
import { scaffoldLessonPlan, scaffoldExamples } from "@/lib/embedded/deck";
import { applySlidesRevision } from "@/lib/embedded/revise";
import { callLlm, normalizeProvider, type LlmProvider } from "@/lib/llm";
import { filesToLlmParts } from "@/lib/llm-files";
import { jsonObjectSlice, propagateExampleCodeToFollowups, toSlideData } from "./shared";





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
