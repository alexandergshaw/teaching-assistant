"use server";

import {
  gradeSubmissions,
  synthesizeFullCreditChecklist,
  extractSubmissions,
  generateRubric,
  type GradingRun,
} from "@/lib/grade";
import { OfficeParser, type SupportedFileType } from "officeparser";
import { getGeminiApiKey, getGeminiModel } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { logChatExchange } from "@/lib/supabase/chat-logs";

export interface SlideData {
  title: string;
  bullets: string[];
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
  contextText: string
): Promise<ModuleIntroData | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Module intro generation failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

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
  currentSlides?: SlideData[]
): Promise<GenerateLessonPlanResult | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

    const filesSummary =
      files.length > 0
        ? `\n\nATTACHED FILES (${files.length}):\n${files.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const revisionSection =
      revisionPrompt && currentSlides
        ? `\n\nCURRENT SLIDE DECK (JSON):\n${JSON.stringify(currentSlides, null, 2)}\n\nREVISION INSTRUCTIONS:\n${revisionPrompt}\n\nUpdate the slide deck based on the revision instructions. Preserve slides that don't need to change; modify, add, or remove slides as needed.`
        : "";

    const prompt = `You are an expert educator creating a lecture slide deck.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}${filesSummary}${revisionSection}

Create a complete set of lecture slides that fully address the module objectives. Return ONLY valid JSON:
{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."] }
  ]
}

Requirements:
- Each slide must have a "title" and a "bullets" array.
- Maximum 3 bullets per slide.
- Each bullet must be a single, concise idea — no sub-points.
- Use plenty of real-world analogies and concrete examples that students will immediately recognise (everyday technology, social media, sports, food, pop culture, etc.).
- The first slide should be a title/overview slide listing the key topics.
- Include enough slides to thoroughly cover every objective.
- Do not include any text outside the JSON object.`;

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: prompt },
      ...files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } })),
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Gemini API error: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

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
      slides?: Array<{ title?: string; bullets?: string[] }>;
    };

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return { error: "Model did not return a valid slides array." };
    }

    const slides: SlideData[] = parsed.slides
      .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
      .map((s) => ({ title: s.title!, bullets: (s.bullets ?? []).slice(0, 3) }));

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
  files: Array<{ name: string; base64: string; mimeType: string }>
): Promise<AssignmentData | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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
      ...files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } })),
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Assignment generation failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

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
  contextText: string
): Promise<string | { error: string }> {
  try {
    const instructions = `MODULE OBJECTIVES:\n${moduleObjectives}${contextText ? `\n\nCONTEXT:\n${contextText}` : ""}`;
    return await generateRubric(instructions);
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
  slides: SlideData[]
): Promise<ExamplesData | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 3072 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Examples generation failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

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
  for (const file of files) {
    if (file.mimeType === "application/pdf" || file.mimeType.startsWith("image/")) {
      parts.push({ inlineData: { mimeType: file.mimeType, data: file.base64 } });
      continue;
    }

    if (file.mimeType.startsWith("text/")) {
      const text = Buffer.from(file.base64, "base64").toString("utf-8").trim();
      if (text) {
        parts.push({ text: `\n\nADDITIONAL CONTEXT FILE (${file.name}):\n${text}` });
      }
      continue;
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
    if (ext === "docx") {
      try {
        const JSZip = (await import("jszip")).default;
        const buffer = Buffer.from(file.base64, "base64");
        const zip = await JSZip.loadAsync(buffer);
        const documentXml = zip.file("word/document.xml");
        if (documentXml) {
          let xml = await documentXml.async("string");
          xml = xml
            .replace(/<w:tab\s*\/?>/g, "\t")
            .replace(/<w:br\s*\/?>/g, "\n")
            .replace(/<w:p[^>]*>/g, "\n")
            .replace(/<[^>]+>/g, "");
          const text = xml
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          if (text) {
            parts.push({ text: `\n\nADDITIONAL CONTEXT FILE (${file.name}):\n${text}` });
          }
        }
      } catch {
        // Ignore unreadable context files instead of failing the full request.
      }
    }
  }
}

export async function parseSyllabusAction(
  courseTitle: string,
  file: { name: string; base64: string; mimeType: string },
  additionalContext?: string,
  contextFiles: SyllabusContextFile[] = []
): Promise<{ sections: SyllabusSection[]; templateText: string } | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        return { error: `Syllabus parsing failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
      // Extract plain text from DOCX / PPTX / XLSX / etc.
      const buffer = Buffer.from(file.base64, "base64");
      const ext = file.name.includes(".")
        ? file.name.split(".").pop()!.toLowerCase()
        : "";

      try {
        // For DOCX, direct XML extraction is most reliable (matches grade.ts approach).
        if (ext === "docx") {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(buffer);
          const documentXml = zip.file("word/document.xml");
          if (documentXml) {
            let xml = await documentXml.async("string");
            xml = xml
              .replace(/<w:tab\s*\/?>/g, "\t")
              .replace(/<w:br\s*\/?>/g, "\n")
              .replace(/<w:p[^>]*>/g, "\n")
              .replace(/<[^>]+>/g, "");
            extractedText = xml
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
          }
        }

        // Fall back to OfficeParser with explicit fileType for other formats (or if XML extraction yielded nothing).
        if (!extractedText) {
          const officeFileTypes: Record<string, SupportedFileType> = {
            docx: "docx",
            pptx: "pptx",
            xlsx: "xlsx",
            odt: "odt",
            odp: "odp",
            ods: "ods",
            rtf: "rtf",
          };
          const fileType = officeFileTypes[ext];
          const ast = fileType
            ? await OfficeParser.parseOffice(buffer, { fileType })
            : await OfficeParser.parseOffice(buffer);
          const conversion = await ast.to("text");
          extractedText = typeof conversion.value === "string" ? conversion.value.trim() : "";
        }
      } catch {
        return { error: "Could not read the uploaded file. Please try a .txt, .pdf, or .docx file." };
      }

      if (!extractedText) {
        return { error: "The uploaded file appears to be empty or could not be read." };
      }
      parts = [{ text: `${prompt}\n\nSYLLABUS TEMPLATE TEXT:\n${extractedText}` }];
      await appendSyllabusContextParts(parts, contextFiles);
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Syllabus parsing failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
  contextFiles: SyllabusContextFile[] = []
): Promise<string | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Section generation failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
  contextFiles: SyllabusContextFile[] = []
): Promise<{ contents: string[] } | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Section generation failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
  lockedSections: boolean[] = []
): Promise<{ contents: string[] } | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    for (const file of files) {
      if (file.mimeType === "application/pdf" || file.mimeType.startsWith("image/")) {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.base64 } });
      } else if (file.mimeType.startsWith("text/")) {
        const text = Buffer.from(file.base64, "base64").toString("utf-8").trim();
        if (text) parts.push({ text: `\n\nATTACHED FILE (${file.name}):\n${text}` });
      } else {
        const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
        if (ext === "docx") {
          try {
            const JSZip = (await import("jszip")).default;
            const buffer = Buffer.from(file.base64, "base64");
            const zip = await JSZip.loadAsync(buffer);
            const documentXml = zip.file("word/document.xml");
            if (documentXml) {
              let xml = await documentXml.async("string");
              xml = xml
                .replace(/<w:tab\s*\/?>/g, "\t")
                .replace(/<w:br\s*\/?>/g, "\n")
                .replace(/<w:p[^>]*>/g, "\n")
                .replace(/<[^>]+>/g, "");
              const text = xml.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
              if (text) parts.push({ text: `\n\nATTACHED FILE (${file.name}):\n${text}` });
            }
          } catch { /* skip unreadable file */ }
        }
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Syllabus revision failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
  contents: string[]
): Promise<{ text: string } | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    if (templateFile.mimeType === "application/pdf" || templateFile.mimeType.startsWith("image/")) {
      parts.push({ inlineData: { mimeType: templateFile.mimeType, data: templateFile.base64 } });
    } else if (templateFile.mimeType.startsWith("text/")) {
      const raw = Buffer.from(templateFile.base64, "base64").toString("utf-8");
      parts.push({ text: `\n\nORIGINAL TEMPLATE:\n${raw}` });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Assembly failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `Summarize this student file in one sentence.\n\nFile: ${fileName}\n\n${truncated}` }],
            },
          ],
        }),
      }
    );

    const body = await response.text();

    if (!response.ok) {
      return { result: null, error: `HTTP ${response.status}: ${body}` };
    }

    const data = JSON.parse(body) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "(no response text)";

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
}

export async function gradeAction(
  _prev: GradeActionState,
  formData: FormData
): Promise<GradeActionState> {
  const file = formData.get("studentSubmissions") as File | null;
  const assignmentInstructions =
    (formData.get("assignmentInstructions") as string | null) ?? "";
  const rubric = (formData.get("rubric") as string | null) ?? "";

  if (!file || file.size === 0) {
    return { run: null, error: "Please upload a student submissions zip file." };
  }

  if (!assignmentInstructions.trim()) {
    return { run: null, error: "Please provide assignment instructions." };
  }

  try {
    const effectiveRubric = rubric.trim()
      ? rubric
      : await generateRubric(assignmentInstructions);
    const generatedRubric = rubric.trim() ? undefined : effectiveRubric;

    const zipBuffer = await file.arrayBuffer();
    const [run, fullCreditChecklist] = await Promise.all([
      gradeSubmissions(zipBuffer, assignmentInstructions, effectiveRubric),
      synthesizeFullCreditChecklist(assignmentInstructions, effectiveRubric),
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
  sessionId: string
): Promise<string | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Chat failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const reply =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    const replyText = reply || "No response from the model.";

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

export async function generateCourseScheduleAction(
  courseDescription: string,
  term: string,
  startingDate: string,
  numberOfWeeks: number,
  numberOfTests: number
): Promise<CourseScheduleResult | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Schedule generation failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
