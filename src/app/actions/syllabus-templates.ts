"use server";

import { parseLenientJsonArray } from "@/lib/lenient-json";
import type { RunSpan } from "@/lib/office-edit";
import { parseOfficeParagraphs, applyOfficeSections } from "@/lib/office-edit";
import { buildDocxFromPlainText } from "@/lib/docx";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, type SyllabusTemplateMeta, type SyllabusTemplate } from "@/lib/supabase/syllabus-templates";
import { listSyllabi, getSyllabus, createSyllabus, renameSyllabus, deleteSyllabus, type FinalizedSyllabusMeta, type FinalizedSyllabus } from "@/lib/supabase/course-syllabi";

// ── Syllabus template library ───────────────────────────────────────────────

const MAX_TEMPLATE_BASE64 = 8 * 1024 * 1024; // ~6 MB .docx

/** List the owner's saved syllabus templates (metadata only). */
export async function listSyllabusTemplatesAction(): Promise<
  { templates: SyllabusTemplateMeta[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    return { templates: await listTemplates(user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list syllabus templates." };
  }
}

/** Fetch one syllabus template including its base64 .docx content. */
export async function getSyllabusTemplateAction(
  id: string
): Promise<{ template: SyllabusTemplate } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a template." };
    const template = await getTemplate(user.id, id);
    if (!template) return { error: "That template no longer exists." };
    return { template };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the template." };
  }
}

/** Save a new syllabus template from an uploaded .docx (base64). */
export async function createSyllabusTemplateAction(
  name: string,
  fileName: string,
  base64: string
): Promise<{ template: SyllabusTemplateMeta } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!name.trim()) return { error: "Enter a template name." };
    if (!/\.docx$/i.test(fileName.trim())) return { error: "The template must be a Word .docx file." };
    if (!base64) return { error: "Upload a .docx file." };
    if (base64.length > MAX_TEMPLATE_BASE64) return { error: "That file is too large (limit ~6 MB)." };
    return { template: await createTemplate(user.id, name.trim(), fileName.trim(), base64) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the template." };
  }
}

/** Rename a syllabus template and/or replace its .docx file. */
export async function updateSyllabusTemplateAction(
  id: string,
  fields: { name?: string; fileName?: string; base64?: string }
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a template." };
    const update: { name?: string; fileName?: string; content?: string } = {};
    if (fields.name !== undefined) {
      if (!fields.name.trim()) return { error: "Enter a template name." };
      update.name = fields.name.trim();
    }
    if (fields.base64 !== undefined) {
      if (!fields.fileName || !/\.docx$/i.test(fields.fileName.trim())) {
        return { error: "The template must be a Word .docx file." };
      }
      if (fields.base64.length > MAX_TEMPLATE_BASE64) return { error: "That file is too large (limit ~6 MB)." };
      update.fileName = fields.fileName.trim();
      update.content = fields.base64;
    }
    if (Object.keys(update).length === 0) return { error: "Nothing to update." };
    await updateTemplate(user.id, id, update);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the template." };
  }
}

/** Delete a syllabus template. */
export async function deleteSyllabusTemplateAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a template." };
    await deleteTemplate(user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the template." };
  }
}

/**
 * Generate a complete filled syllabus .docx from a saved template and a block
 * of course facts, in one shot. The model sees the template's paragraph list
 * and returns per-paragraph replacements; policy boilerplate stays untouched,
 * and the docx is rebuilt through the same helper the adapt flow uses.
 */
export async function generateCourseSyllabusAction(
  templateId: string,
  facts: {
    courseName: string;
    courseCode: string;
    term: string;
    description: string;
    dayTime: string;
    startDate: string;
    weeks: string;
    tests: string;
    textbook: string;
    email: string;
    lmsUrl: string;
    institution: string;
  },
  provider: LlmProvider = "gemini"
): Promise<{ base64: string; name: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!templateId.trim()) return { error: "Choose a syllabus template." };
    const template = await getTemplate(user.id, templateId);
    if (!template) return { error: "Choose a syllabus template." };

    const buffer = Buffer.from(template.content, "base64");
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    if (paragraphs.length === 0) {
      return { error: "Could not read any text from that template. Save the template as a Word .docx." };
    }

    // Paragraph list for the model (id + text), capped at ~16000 chars overall
    // so a long template cannot blow out the prompt.
    const paraLines: string[] = [];
    let paraChars = 0;
    for (const p of paragraphs) {
      const line = `[${p.id}] ${p.text}`;
      if (paraChars + line.length + 1 > 16000) break;
      paraLines.push(line);
      paraChars += line.length + 1;
    }
    const paraList = paraLines.join("\n");

    const factEntries: Array<[string, string]> = [
      ["Course name", facts.courseName],
      ["Course code", facts.courseCode],
      ["Term/semester", facts.term],
      ["Course description", facts.description],
      ["Meeting days/times", facts.dayTime],
      ["Start date", facts.startDate],
      ["Number of weeks", facts.weeks],
      ["Tests/exams", facts.tests],
      ["Textbook/materials", facts.textbook],
      ["Instructor email", facts.email],
      ["LMS URL", facts.lmsUrl],
      ["Institution", facts.institution],
    ];
    const factsBlock = factEntries
      .map(([label, value]) => `${label}: ${value.trim() || "(not provided)"}`)
      .join("\n");

    const prompt = `You are filling in a course syllabus template for a new course offering.

COURSE FACTS:
${factsBlock}

The syllabus template is a list of numbered paragraphs (id in brackets):
${paraList}

Identify every paragraph whose text should change to reflect the course facts above — course title/number, term, instructor contact info, meeting days and times, start and end dates, course description, weekly schedule rows, tests/exams, textbook and materials, LMS links, institution name, and similar class-specific content. Leave generic policy boilerplate untouched (university policies, academic integrity, accessibility/Title IX, grading-scale rules, and the like).

Return ONLY a valid JSON array, where each element is:
{ "id": "<paragraphId>", "text": "<the COMPLETE replacement text for that paragraph>" }

Requirements:
- Use exact paragraph id values from the list; "text" fully replaces that paragraph's text.
- Keep each replacement in the same style and length register as the original paragraph (a short label line stays a short label line; a prose paragraph stays prose).
- Never invent facts that were not provided. Where a needed fact is "(not provided)", leave that paragraph unchanged by omitting it from the array.
- Only include paragraphs that actually change.
- Do not include any text outside the JSON array.`;

    // Guarded parse with one retry (same idiom as generateSlidesForAssignment):
    // a raw JSON.parse error must never surface, and a malformed first response
    // gets one fresh model call before giving up.
    let replacements: Array<{ id: string; text: string }> | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        },
        provider
      );
      if (!result.ok) {
        return { error: `Syllabus generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
      }

      const parsed = parseLenientJsonArray(result.text);
      if (!parsed) {
        if (attempt === 1) {
          console.error(`Syllabus JSON parse failed for template "${template.name}" (attempt 1): no JSON array in the response`);
          continue;
        }
        return { error: "Could not parse the syllabus from the model output. Try again." };
      }

      replacements = parsed
        .map((r) => {
          const o = (r ?? {}) as { id?: unknown; text?: unknown };
          return {
            id: typeof o.id === "string" ? o.id : "",
            text: typeof o.text === "string" ? o.text : "",
          };
        })
        .filter((r) => r.id && r.text.trim());
      break;
    }
    if (!replacements) {
      return { error: "Could not parse the syllabus from the model output. Try again." };
    }

    const byId = new Map(paragraphs.map((p) => [p.id, p]));
    const replacementById = new Map<string, string>();
    for (const r of replacements) {
      if (byId.has(r.id)) replacementById.set(r.id, r.text.trim());
    }

    // Rebuild through the same helper the adapt flow uses. Every paragraph gets
    // a section (applyOfficeSections deletes known paragraphs with no section);
    // unchanged paragraphs pass their original runs so they stay byte-for-byte.
    // Replaced paragraphs keep a leading bold label bold when the replacement
    // still starts with it (the boldLabelSpans pattern from the adapt editor).
    const sections = paragraphs.map((p) => {
      const replacement = replacementById.get(p.id);
      if (replacement === undefined || replacement === p.text) {
        return { sourceId: p.id, spans: p.runs.length > 0 ? p.runs : [{ text: p.text }] };
      }
      let boldPrefix = "";
      for (const run of p.runs) {
        if (!run.bold) break;
        boldPrefix += run.text;
      }
      const spans: RunSpan[] =
        boldPrefix && replacement.startsWith(boldPrefix) && replacement.length > boldPrefix.length
          ? [{ text: boldPrefix, bold: true }, { text: replacement.slice(boldPrefix.length) }]
          : [{ text: replacement }];
      return { sourceId: p.id, spans };
    });

    const out = await applyOfficeSections("docx", buffer, sections);
    return { base64: out.toString("base64"), name: `${facts.courseName.trim() || "Course"} Syllabus` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the syllabus." };
  }
}

// ── Finalized syllabi library (the completed .docx outputs) ──────────────

/** List the owner's saved finalized syllabi (metadata only). */
export async function listFinalizedSyllabiAction(): Promise<
  { syllabi: FinalizedSyllabusMeta[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    return { syllabi: await listSyllabi(user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list your saved syllabi." };
  }
}

/** Fetch one finalized syllabus including its base64 .docx content. */
export async function getFinalizedSyllabusAction(
  id: string
): Promise<{ syllabus: FinalizedSyllabus } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a syllabus." };
    const syllabus = await getSyllabus(user.id, id);
    if (!syllabus) return { error: "That syllabus no longer exists." };
    return { syllabus };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the syllabus." };
  }
}

/** A finalized syllabus parsed into formatted paragraphs for a read-only preview. */
export async function previewFinalizedSyllabusAction(
  id: string
): Promise<
  | { name: string; paragraphs: Array<{ id: string; text: string; runs: RunSpan[]; style: string }> }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a syllabus." };
    const syllabus = await getSyllabus(user.id, id);
    if (!syllabus) return { error: "That syllabus no longer exists." };
    const buffer = Buffer.from(syllabus.content, "base64");
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    return {
      name: syllabus.name,
      paragraphs: paragraphs.map((p) => ({ id: p.id, text: p.text, runs: p.runs, style: p.style })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the syllabus for preview." };
  }
}

/** Save a finalized syllabus (.docx base64) to the owner's library. */
export async function createFinalizedSyllabusAction(
  name: string,
  fileName: string,
  base64: string,
  courseCode?: string
): Promise<{ syllabus: FinalizedSyllabusMeta } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!name.trim()) return { error: "Enter a name for the syllabus." };
    if (!/\.docx$/i.test(fileName.trim())) return { error: "The syllabus must be a Word .docx file." };
    if (!base64) return { error: "Build the syllabus first." };
    if (base64.length > MAX_TEMPLATE_BASE64) return { error: "That file is too large (limit ~6 MB)." };
    return { syllabus: await createSyllabus(user.id, name.trim(), fileName.trim(), base64, courseCode?.trim() || undefined) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the syllabus." };
  }
}

/** Rename a finalized syllabus. */
export async function renameFinalizedSyllabusAction(
  id: string,
  name: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a syllabus." };
    if (!name.trim()) return { error: "Enter a name for the syllabus." };
    await renameSyllabus(user.id, id, name.trim());
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rename the syllabus." };
  }
}

/** Delete a finalized syllabus. */
export async function deleteFinalizedSyllabusAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a syllabus." };
    await deleteSyllabus(user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the syllabus." };
  }
}

// ── LMS syllabus imports ────────────────────────────────────────────────────

/** Fetch course metadata from the LMS: name, start date, and syllabus HTML. */
export async function getCourseInfoAction(
  courseUrl: string,
  acronym?: string
): Promise<{ name: string; startAt: string | null; syllabusBody: string } | { error: string }> {
  try {
    const { getCourseInfo } = await import("@/lib/canvas");
    await requireOwner();
    return await getCourseInfo(courseUrl, acronym?.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load course information." };
  }
}

/**
 * Fetch the LMS course's syllabus, convert it to a Word document,
 * save it to the finalized library, and return the saved syllabus metadata.
 */
export async function importLmsSyllabusAction(
  courseUrl: string,
  acronym: string | undefined,
  courseName: string
): Promise<{ syllabusId: string; name: string } | { error: string }> {
  try {
    const { getCourseInfo } = await import("@/lib/canvas");
    await requireOwner();
    const info = await getCourseInfo(courseUrl, acronym?.trim());
    return await saveSyllabusHtmlAsFinalized(courseName, info.syllabusBody);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not import the syllabus from the LMS." };
  }
}

/**
 * Convert syllabus HTML pulled from an uploaded LMS export package into a Word
 * document in the finalized library. The client parses the cartridge (the
 * archive can exceed server action payload limits); only the small HTML body
 * crosses the wire.
 */
export async function importSyllabusHtmlAction(
  courseName: string,
  syllabusHtml: string
): Promise<{ syllabusId: string; name: string } | { error: string }> {
  try {
    await requireOwner();
    return await saveSyllabusHtmlAsFinalized(courseName, syllabusHtml);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not import the syllabus from the export." };
  }
}

/** Shared tail of the LMS/export syllabus imports: HTML to .docx to library. */
async function saveSyllabusHtmlAsFinalized(
  courseName: string,
  syllabusHtml: string
): Promise<{ syllabusId: string; name: string } | { error: string }> {
  if (!syllabusHtml.trim()) {
    return { error: "The LMS course has no syllabus content." };
  }

  const text = syllabusHtml
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    // Collapse runs of spaces/tabs but keep the paragraph breaks added above.
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  const docxBuffer = await buildDocxFromPlainText(text, [], undefined);
  const base64 = Buffer.from(docxBuffer).toString("base64");
  const syllabusName = `${courseName} syllabus (LMS import)`;
  const result = await createFinalizedSyllabusAction(syllabusName, "lms-syllabus.docx", base64);
  if ("error" in result) {
    return result;
  }
  return { syllabusId: result.syllabus.id, name: result.syllabus.name };
}
