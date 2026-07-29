"use server";

import type { SlideData, GenerateLessonPlanResult, AssignmentData, ModuleIntroData, ExampleItem, ExamplesData, TestGeminiState, TestQuestionsData, TestQuestionItem } from "../actions-types";
import { extractSubmissions, generateRubric } from "@/lib/grade";
import { scaffoldModuleIntro, scaffoldAssignment } from "@/lib/embedded/content";
import { scaffoldLessonPlan, scaffoldExamples } from "@/lib/embedded/deck";
import { scaffoldQuizQuestions } from "@/lib/embedded/quiz";
import { applySlidesRevision } from "@/lib/embedded/revise";
import { callLlm, normalizeProvider, type LlmProvider } from "@/lib/llm";
import { filesToLlmParts } from "@/lib/llm-files";
import { jsonObjectSlice, propagateExampleCodeToFollowups, toSlideData } from "./shared";
import { TEST_QUESTION_KINDS, type TestQuestionKind } from "@/lib/artifact-templates/types";
import { courseKindContract, APPLIED_REAL_TOOL_RULE, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";





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
- ${PLAIN_LANGUAGE_CONTRACT}
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
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding",
  // AC2: the real professional tool(s) this module has already committed to
  // (semicolon-joined, e.g. "Trello (free plan); Excel (free trial)") -
  // mirrors generateAssignmentInstructionsForAssignment's requiredTools
  // parameter in shared.ts. When set (and only for an applied course - see
  // AC4), the "tools" field must build on these instead of choosing
  // independently. "" (the default) asks for nothing extra, so every
  // pre-existing call site is unaffected - optional and last for that reason.
  requiredTools = ""
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

    // AC1: an applied course's tool rule used to be purely negative ("do not
    // list programming languages...") plus category hints ("boards,
    // planners"), never a requirement to actually NAME a product - unlike the
    // deck's parallel "REAL PROFESSIONAL TOOLS" rule (slide-prompt.ts), which
    // this reuses verbatim via APPLIED_REAL_TOOL_RULE so the two prompts
    // cannot say different things about what counts as an acceptable tool.
    // AC2: fold in a pre-selected tool when one was supplied, so the
    // assignment builds on the SAME tool rather than choosing its own.
    // Guarded on courseKind === "applied" so a coding call is byte-identical
    // to before even if a caller mistakenly passed requiredTools (AC4).
    const toolRequirement =
      courseKind === "applied" && requiredTools.trim()
        ? ` The tool(s) for this assignment are already decided - build every step's hands-on work around: ${requiredTools.trim()}. Do not introduce a different tool.`
        : "";

    const prompt = `You are an expert educator designing a hands-on, industry-simulating assignment.

${courseKindContract(courseKind)}

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
- Every tool listed must be free and accessible, and must be a tool practitioners in THIS field actually use.${
      courseKind === "coding"
        ? " For a programming course that means things like Python, VS Code, Google Colab, GitHub, or Replit."
        : ` Do not list programming languages, IDEs, or developer platforms. Every entry in "tools" must ${APPLIED_REAL_TOOL_RULE}${toolRequirement}`
    }
- 4–8 concrete, sequential steps that a student can complete working alone.
- Tie every step clearly to the module objectives.
- Deliverables should be specific and assessable.
- ${PLAIN_LANGUAGE_CONTRACT}
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

/**
 * Generate a set of test/exam questions matching a spec's sections (each
 * section names a question kind, how many of that kind, and how many points
 * each is worth). Written to the same shape as generateAssignmentAction:
 * embedded fallback, strict JSON prompt, and defensive parsing that never
 * lets garbage from the model reach Canvas.
 */
export async function generateTestQuestionsAction(
  moduleObjectives: string,
  contextText: string,
  sections: Array<{ kind: TestQuestionKind; count: number; pointsEach: number }>,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<TestQuestionsData | { error: string }> {
  try {
    // Embedded Deterministic Engine: template the questions from the supplied
    // context text with no model call. scaffoldQuizQuestions can only ever
    // emit "multiple_choice" or "fill_blank" (mapped here to "short_answer"),
    // so this fallback cannot produce true_false/essay questions - the
    // requested section kinds only shape how many questions are asked for and
    // what each is worth.
    if (provider === "embedded") {
      const totalCount = sections.reduce((sum, s) => sum + s.count, 0);
      // Flatten the sections into one slot per requested question, in order,
      // so the i-th scaffolded question is scored by the i-th slot's points -
      // the "matching section" a scaffolded question corresponds to.
      const slots = sections.flatMap((s) => Array.from({ length: s.count }, () => s));
      const scaffolded = scaffoldQuizQuestions(contextText, totalCount);
      const questions: TestQuestionItem[] = scaffolded.map((q, i) => ({
        kind: q.type === "multiple_choice" ? "multiple_choice" : "short_answer",
        prompt: q.prompt,
        choices: q.choices ?? [],
        answer: q.answer,
        points: slots[i]?.pointsEach ?? 0,
      }));
      return {
        title: "Test",
        instructions: "Answer every question. Show your work where it applies.",
        questions,
      };
    }

    const sectionsList = sections
      .map((s, i) => {
        const label = TEST_QUESTION_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind;
        return `${i + 1}. ${label}: ${s.count} question(s), ${s.pointsEach} point(s) each`;
      })
      .join("\n");

    const prompt = `You are an expert educator writing a test for a course.

${courseKindContract(courseKind)}

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}

SECTIONS (produce exactly these questions, in this order):
${sectionsList || "(no sections requested)"}

Return ONLY valid JSON:
{
  "title": "...",
  "instructions": "...",
  "questions": [
    { "kind": "multiple_choice", "prompt": "...", "choices": ["...", "...", "...", "..."], "answer": "...", "points": 0 }
  ]
}

Requirements:
- "kind" must be exactly one of: multiple_choice, true_false, short_answer, essay.
- Produce exactly the count of each kind requested above, in the same order as the sections list.
- "choices" is required (at least 4 options) for multiple_choice questions and must be an empty array for every other kind.
- "answer" is the exact correct choice text for multiple_choice, "True" or "False" for true_false, the expected response for short_answer, and may be a short model answer sketch for essay.
- "points" must equal the section's stated points for that question.
- ${PLAIN_LANGUAGE_CONTRACT}
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 3072 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Test generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse test data from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      title?: string;
      instructions?: string;
      questions?: Array<{ kind?: string; prompt?: string; choices?: string[]; answer?: string; points?: number }>;
    };

    const sectionByKind = new Map(sections.map((s) => [s.kind, s]));

    const questions: TestQuestionItem[] = (parsed.questions ?? [])
      .filter(
        (q): q is { kind: string; prompt: string; choices?: string[]; answer?: string; points?: number } =>
          !!q.kind && !!q.prompt && TEST_QUESTION_KINDS.some((k) => k.value === q.kind)
      )
      .filter((q) => q.kind !== "multiple_choice" || (Array.isArray(q.choices) && q.choices.length >= 2))
      .map((q) => {
        const kind = q.kind as TestQuestionKind;
        const points =
          typeof q.points === "number" && Number.isFinite(q.points)
            ? q.points
            : sectionByKind.get(kind)?.pointsEach ?? 0;
        return {
          kind,
          prompt: q.prompt,
          choices: Array.isArray(q.choices) ? q.choices : [],
          answer: q.answer ?? "",
          points,
        };
      });

    return {
      title: parsed.title ?? "Test",
      instructions: parsed.instructions ?? "",
      questions,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
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
- ${PLAIN_LANGUAGE_CONTRACT}
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

/**
 * Revise an already-generated text document according to the user's typed
 * instructions. This is the engine behind the shared document preview/edit
 * window's "regenerate with instructions" box, so it is deliberately
 * format-agnostic: every generator in the app produces plain, markdown-ish
 * text (which buildDocxFromPlainText then renders), so one revision action
 * serves the syllabus, rubrics, handouts, tests, and activities alike.
 *
 * The contract is REPLACEMENT, not commentary: the model returns the complete
 * revised document and nothing else, because the caller writes the result
 * straight back over the document being edited.
 */
export async function reviseDocumentAction(
  documentText: string,
  instructions: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    const text = documentText.trim();
    if (!text) return { error: "There is no document text to revise." };

    const ask = instructions.trim();
    if (!ask) return { error: "Say what you would like changed." };

    // Embedded Deterministic Engine: no model is available, so the document is
    // returned unchanged with the request recorded as a trailing note. Silently
    // returning the input would look like a revision that did nothing.
    if (provider === "embedded") {
      return {
        text: `${text}\n\n## Requested revision (not applied - no model configured)\n\n${ask}`,
      };
    }

    const prompt = `You are revising an existing course document for its instructor.

CURRENT DOCUMENT:
${text}

REQUESTED CHANGES:
${ask}

Rewrite the document so it satisfies the requested changes.

Requirements:
- Return the COMPLETE revised document, ready to use as-is.
- Preserve everything the request did not ask you to change, including the existing heading structure and wording.
- Keep the same plain-text/markdown-ish formatting conventions the document already uses.
- Do not add commentary, preamble, or an explanation of what you changed. Return only the document text.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Revision failed: HTTP ${result.status} - ${result.body.slice(0, 200)}` };
    }

    const revised = result.text.trim();
    if (!revised) return { error: "The model returned an empty document." };

    return { text: revised };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Answer a free-form question about one course, grounded in the facts the app
 * already holds for it. Backs the "Ask AI" button on each course row.
 *
 * The facts are passed in as a pre-rendered block rather than as a Course
 * object so this action stays free of the Supabase row shape - the caller
 * already has the course loaded and decides what is worth sending.
 */
export async function askAboutCourseAction(
  courseFacts: string,
  question: string,
  provider: LlmProvider = "gemini"
): Promise<{ answer: string } | { error: string }> {
  try {
    const ask = question.trim();
    if (!ask) return { error: "Ask a question first." };

    const facts = courseFacts.trim();

    // Embedded Deterministic Engine: no model to ask, so the question is
    // echoed back with the facts on hand rather than a fabricated answer.
    if (provider === "embedded") {
      return {
        answer: `No model is configured, so this question was not answered.\n\nQuestion: ${ask}\n\nWhat the app knows about this course:\n${facts || "(nothing recorded)"}`,
      };
    }

    const prompt = `You are helping a college instructor with one of their courses.

WHAT THE APP KNOWS ABOUT THIS COURSE:
${facts || "(nothing recorded)"}

QUESTION:
${ask}

Answer the question directly and concretely, in plain prose.

Requirements:
- Ground your answer in the course facts above wherever they are relevant.
- If the facts do not contain what you would need, say so plainly and answer from general teaching practice instead - do not invent specifics about this course.
- Be concise. No preamble, no restating the question.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Could not answer: HTTP ${result.status} - ${result.body.slice(0, 200)}` };
    }

    const answer = result.text.trim();
    if (!answer) return { error: "The model returned an empty answer." };

    return { answer };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
