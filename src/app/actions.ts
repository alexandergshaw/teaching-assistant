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
import type { AttachedFile } from "@/lib/chat/types";
import {
  PROFESSIONAL_SPEECH_RULE,
  DOCUMENT_HEADER_RULES,
  DOCUMENT_LABEL_BOLD_RULE,
  DOCUMENT_SECTION_NEWLINE_RULE,
  normalizeHeadingSpacing,
} from "@/lib/formatting-rules";

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
- ${PROFESSIONAL_SPEECH_RULE}
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
- ${PROFESSIONAL_SPEECH_RULE}
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
- ${PROFESSIONAL_SPEECH_RULE}
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
- ${PROFESSIONAL_SPEECH_RULE}
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

Write the content for the "${section.heading}" section of this syllabus. Be specific, professional, and practical. Use the guidance, the original template, and any previously completed sections for context and consistency. Write only the section content — do not include the heading itself, markdown formatting, or any preamble. ${SYLLABUS_VERTICAL_LIST_REQUIREMENT} ${SYLLABUS_SCHEDULE_REQUIREMENT} ${PROFESSIONAL_SPEECH_RULE} If any headings appear, use normal sentence case — never all caps. If you need to make a late policy, be sure that assignments submitted after the deadline can only earn a maxiumum of 85%, be sure it encourages resubmissions and prevents AI abuse in a way that is not time demanding for the instructor.`;

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
- ${PROFESSIONAL_SPEECH_RULE}
- If any headings appear, use normal sentence case — never all caps.
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
- ${PROFESSIONAL_SPEECH_RULE}
- If any headings appear, use normal sentence case — never all caps.
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

Output ONLY the reconstructed document text — no preamble, no explanation. ${PROFESSIONAL_SPEECH_RULE} Any headings you generate must be in normal sentence case — never all caps.

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
  sessionId: string,
  fileAttachments: AttachedFile[] = []
): Promise<string | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

    const systemPrompt = `You are a helpful teaching assistant. The user has highlighted the following text and has a question about it. Answer concisely and helpfully. Use plain prose only — do not use any markdown formatting, bold, italics, bullet points, headers, or special symbols. ${PROFESSIONAL_SPEECH_RULE}

HIGHLIGHTED TEXT:
"""
${selectedText}
"""`;

    type GeminiPart =
      | { text: string }
      | { inline_data: { mime_type: string; data: string } };

    const buildFileParts = (files: AttachedFile[]): GeminiPart[] =>
      files.map((f) =>
        f.isText
          ? { text: `\n\n[Attached file: ${f.name}]\n${f.data}` }
          : { inline_data: { mime_type: f.mimeType, data: f.data } }
      );

    const lastUserParts: GeminiPart[] = [
      { text: question },
      ...buildFileParts(fileAttachments),
    ];

    const contents = [
      { role: "user" as const, parts: [{ text: systemPrompt }] },
      { role: "model" as const, parts: [{ text: "Understood. I'll answer questions about the highlighted text in plain prose with no formatting." }] },
      ...history.map((m) => ({ role: m.role as "user" | "model", parts: [{ text: m.text }] })),
      { role: "user" as const, parts: lastUserParts },
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

export async function generateCopilotProjectPromptAction(
  fileContent: string,
  fileName: string
): Promise<{ prompt: string } | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

${PROFESSIONAL_SPEECH_RULE} ${DOCUMENT_HEADER_RULES}

Return ONLY the prompt text — no preamble, no explanation, no markdown code fences. Just the raw prompt the teacher will paste into GitHub Copilot.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Prompt generation failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const result =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    if (!result.trim()) {
      return { error: "The model did not return a prompt. Please try again." };
    }

    return { prompt: result.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateCourseProjectRubricAction(
  fileContent: string,
  fileName: string
): Promise<{ rubric: string } | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Rubric generation failed: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

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
  presentationTitle: string;
  slides: SlideData[];
  moduleIntroduction: string;
  assignmentInstructions: string;
}

async function generateSlidesForAssignment(
  assignmentName: string,
  content: string,
  lectureDurationMinutes: number
): Promise<{ presentationTitle: string; slides: SlideData[] } | { error: string }> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();

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
    { "title": "...", "bullets": ["...", "...", "..."] }
  ]
}

Requirements:
- Each slide must have a "title" and a "bullets" array.
- Maximum 4 bullets per slide.
- Each bullet must be a complete, self-explanatory sentence (or two) that a student can fully understand without any verbal elaboration. Define every term you introduce, explain how each concept works, and state why it matters for the assignment. Never use bare keywords or vague one-liners — write as if the student is reading the slide alone with no instructor present.
- The first slide should be a title/overview slide listing the key topics covered in the lecture.
- Cover the concepts introduced in the README or assignment description, highlight what students must implement, and explain any relevant patterns shown in the unit tests or code comments.
- Use real-world analogies and concrete examples that students will recognise; integrate the analogy into the bullet itself so it is self-contained.
- For every concept-focused slide, immediately follow it with two additional slides: (1) a concrete example slide that shows a worked scenario, code snippet, or case study with enough context that a student can follow it independently, and (2) a step-by-step walkthrough slide that explains each step or line in plain English so the student understands the reasoning without needing the instructor to narrate it. Label these slides clearly (e.g. "Example: <concept>" and "Walkthrough: <concept>").
- Do not include any text outside the JSON object.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    return { error: `Gemini API error for "${assignmentName}": HTTP ${response.status} — ${body.slice(0, 200)}` };
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
    return { error: `Could not parse slide data for "${assignmentName}".` };
  }

  const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
    presentationTitle?: string;
    slides?: Array<{ title?: string; bullets?: string[] }>;
  };

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    return { error: `Model did not return a valid slides array for "${assignmentName}".` };
  }

  const slides: SlideData[] = parsed.slides
    .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
    .map((s) => ({ title: s.title!, bullets: (s.bullets ?? []).slice(0, 4) }));

  return {
    presentationTitle: parsed.presentationTitle ?? assignmentName,
    slides,
  };
}

async function generateModuleIntroForAssignment(
  assignmentName: string,
  content: string
): Promise<{ text: string } | { error: string }> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();

  const prompt = `You are an expert educator writing a module introduction document for a programming course.

ASSIGNMENT / MODULE: ${assignmentName}

ASSIGNMENT CONTENT:
${content}

Write a well-formatted module introduction for the week this assignment covers. The document should:
1. Open with an engaging overview of the topic and why it matters.
2. Include a section called "Real-World Applications" with at least 3 concrete, specific examples of how these concepts or technologies are used in real software, industry products, or everyday technology that students will recognise (e.g., how the concept powers a well-known app, framework, or system).
3. Include a brief section called "What You Will Learn" that lists the key skills and concepts students will gain.
4. Be written in clear, motivating language appropriate for undergraduate students.
5. Use plain text formatting with clear section headings (no markdown symbols like # or *).
6. ${DOCUMENT_SECTION_NEWLINE_RULE}

Do not include the assignment instructions or grading criteria — focus only on introducing the module topic.
${DOCUMENT_LABEL_BOLD_RULE}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    return { error: `Gemini API error for module intro "${assignmentName}": HTTP ${response.status} — ${body.slice(0, 200)}` };
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const result =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  if (!result.trim()) {
    return { error: `Module intro generation returned empty response for "${assignmentName}".` };
  }

  return { text: normalizeHeadingSpacing(result.trim()) };
}

async function generateAssignmentInstructionsForAssignment(
  assignmentName: string,
  readmeContent: string
): Promise<{ text: string } | { error: string }> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();

  const prompt = `You are an expert educator writing a formal assignment instruction sheet for a programming course.

ASSIGNMENT: ${assignmentName}

README / ASSIGNMENT SOURCE:
${readmeContent}

Using the README content above, write a complete, student-facing assignment instruction document. The document should:
1. Start with an "Assignment Overview" section that clearly states the purpose and learning objectives.
2. Include a "Instructions" section that details exactly what students must do, broken into numbered steps or tasks pulled from the README.
3. Include a "Requirements" section listing any technical or functional requirements mentioned in the README (e.g., methods to implement, expected behaviour, constraints).
4. End with a "Deliverables" section. The deliverable is ALWAYS: submit the up-to-date zip of the entire codebase with all completed files included.
5. Use plain text formatting with clear section headings (no markdown symbols like # or *).
6. Write in clear, direct language appropriate for undergraduate students.
7. ${DOCUMENT_SECTION_NEWLINE_RULE}

Do not invent requirements not present in the README. If the README is sparse, note that students should refer to the course discussion board for clarification.
${DOCUMENT_LABEL_BOLD_RULE}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    return { error: `Gemini API error for assignment instructions "${assignmentName}": HTTP ${response.status} — ${body.slice(0, 200)}` };
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const result =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  if (!result.trim()) {
    return { error: `Assignment instructions generation returned empty response for "${assignmentName}".` };
  }

  return { text: normalizeHeadingSpacing(result.trim()) };
}

export async function generateCourseRubricFromZipAction(
  zipBase64: string
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
    return await generateRubric(aggregatedText);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateLecturePlansAction(
  zipBase64: string,
  lectureDurationMinutes: number
): Promise<AssignmentPlan[] | { error: string }> {
  const TEXT_EXTENSIONS = new Set([
    ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c",
    ".h", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".r", ".sql",
    ".sh", ".yaml", ".yml", ".json", ".html", ".css", ".scss",
  ]);

  const ASSIGNMENTS_PATTERN = /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;

  const MAX_FILE_CHARS = 3000;
  const MAX_TOTAL_CHARS = 12000;

  try {
    const JSZip = (await import("jszip")).default;
    const buffer = Buffer.from(zipBase64, "base64");
    const zip = await JSZip.loadAsync(buffer);

    const allPaths = Object.keys(zip.files);

    // Collect top-level folder names
    const topFolders = new Set<string>();
    for (const path of allPaths) {
      const m = path.match(/^([^/]+)\//);
      if (m) topFolders.add(m[1]);
    }

    // Find the assignments prefix (top-level first, then one level deep)
    let assignmentsPrefix = "";
    for (const folder of topFolders) {
      if (ASSIGNMENTS_PATTERN.test(folder)) {
        assignmentsPrefix = folder + "/";
        break;
      }
    }

    if (!assignmentsPrefix) {
      // Try one level deep (zip may wrap the repo in a root folder)
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
        error:
          "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    // Find assignment subfolders
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

    // Extract relevant text content per assignment
    const assignmentContents: { name: string; content: string; readmeContent: string }[] = [];

    for (const folder of Array.from(assignmentFolders).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    )) {
      const folderPrefix = assignmentsPrefix + folder + "/";
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
          TEXT_EXTENSIONS.has(ext) &&
          !p.toLowerCase().endsWith(".md") &&
          !name.includes("test") &&
          !name.includes("spec")
        );
      });

      const orderedFiles = [...mdFiles, ...testFiles, ...otherFiles];
      let content = "";
      let totalChars = 0;

      for (const filePath of orderedFiles) {
        if (totalChars >= MAX_TOTAL_CHARS) break;
        const ext = filePath.includes(".") ? "." + filePath.split(".").pop()!.toLowerCase() : "";
        if (!TEXT_EXTENSIONS.has(ext)) continue;

        try {
          let fileContent = await zip.files[filePath].async("string");
          const fileName = filePath.slice(folderPrefix.length);
          if (fileContent.length > MAX_FILE_CHARS) {
            fileContent = fileContent.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
          }
          content += `\n\n=== ${fileName} ===\n${fileContent}`;
          totalChars += fileContent.length;
        } catch {
          // skip unreadable / binary files
        }
      }

      if (content.trim()) {
        // Extract README content specifically for assignment instructions
        const readmeFile = mdFiles.find((p) =>
          p.slice(folderPrefix.length).toLowerCase().startsWith("readme")
        ) ?? mdFiles[0];
        let readmeContent = "";
        if (readmeFile) {
          try {
            readmeContent = await zip.files[readmeFile].async("string");
            if (readmeContent.length > MAX_FILE_CHARS) {
              readmeContent = readmeContent.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
            }
          } catch {
            // fall back to full content
          }
        }
        assignmentContents.push({ name: folder, content, readmeContent: readmeContent || content });
      }
    }

    if (assignmentContents.length === 0) {
      return { error: "No readable text content found in the assignment folders." };
    }

    // Generate slides, module intro, and assignment instructions for each assignment in parallel
    const results = await Promise.all(
      assignmentContents.map(async ({ name, content, readmeContent }) => {
        const [slidesResult, introResult, instructionsResult] = await Promise.all([
          generateSlidesForAssignment(name, content, lectureDurationMinutes),
          generateModuleIntroForAssignment(name, content),
          generateAssignmentInstructionsForAssignment(name, readmeContent),
        ]);
        if ("error" in slidesResult) return null;
        return {
          assignmentName: name,
          ...slidesResult,
          moduleIntroduction: "error" in introResult ? "" : introResult.text,
          assignmentInstructions: "error" in instructionsResult ? "" : instructionsResult.text,
        } satisfies AssignmentPlan;
      })
    );

    const plans = results.filter((r): r is AssignmentPlan => r !== null);

    if (plans.length === 0) {
      return { error: "Failed to generate slides for any assignment. Check your Gemini API key and try again." };
    }

    return plans;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
