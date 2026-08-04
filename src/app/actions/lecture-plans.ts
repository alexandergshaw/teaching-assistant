"use server";

import type { SlideData, AssignmentPlan, ScheduleWeekPlan } from "../actions-types";
import { applyTextRevision, applySlidesRevision } from "@/lib/embedded/revise";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { humanizeAssignmentName } from "@/lib/assignment-name";
import { assignWeekNumbers, renumberWeekLabel } from "@/lib/week-numbering";
import { buildAssignmentPlan, buildStrictTemplateBlock, extractAssignmentContentBundle, findAssignmentsPrefix, jsonObjectSlice, listAssignmentFolders, mapWithConcurrency, propagateExampleCodeToFollowups, toSlideData } from "./shared";
import type { AssignmentContentBundle, LectureTemplates } from "./shared";
import { planCourseCaseStudies, type CaseStudyPlanDiagnostics } from "./case-study-plan";


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
  provider: LlmProvider = "gemini",
  // Non-repo material-source-policy text (source-policy.ts resolver output),
  // folded into each assignment's content via a delimited section so the repo
  // remains the primary source; absent/blank changes nothing.
  supplementalMaterials?: string,
  // Off by default so every existing caller keeps the historical repo-driven
  // behavior: slides can start before any opener exists, and no in-plan
  // opener is attempted unless a step explicitly opts in.
  sequenceOpenerBeforeDeck = false
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

    if (supplementalMaterials?.trim()) {
      for (const bundle of bundles) {
        bundle.content = `${bundle.content}\n\n--- Additional course materials (configured sources) ---\n${supplementalMaterials.trim()}`;
      }
    }

    if (bundles.length === 0) {
      return { error: "No readable text content found in the assignment folders." };
    }

    const templates = await extractLectureTemplates(introTemplateBase64, instructionsTemplateBase64);

    // Normalize week numbers to match the course schedule: file/module numbering
    // downstream is 1-based and schedule-aligned, so zero-based folder sets are
    // shifted up by one. renumberWeekLabel only rewrites a "week NN" token that
    // is exactly one behind, so already-correct labels pass through unchanged.
    // Computed HERE (moved up from after generation) so the case-study plan
    // below can key its per-week assignment by the SAME normalized week
    // number this loop later stamps onto plan.weekNumber.
    const weekMap = assignWeekNumbers(folders);

    // Z1 (Group Z): choose the whole zip's anchor case studies UP FRONT, in
    // ONE pass, before any assignment's deck is generated - the SAME
    // mechanism entry 160/Z1 established for the schedule-driven path
    // (case-study-plan.ts), reaching this repo-zip pipeline too. Before this,
    // a coding course built from an uploaded repo had NO cross-assignment
    // case-study consistency guarantee at all - each deck picked its own.
    // This pipeline has no course-description concept, so the LLM fallback
    // pass's prompt simply omits that clause (planCourseCaseStudies already
    // handles an empty description). The topic/summary fed to the matcher
    // are derived from the bundle itself (a humanized folder name plus a
    // slice of its extracted content) - a reasonable proxy for matching
    // against CASE_STUDIES' topic tags, without duplicating this function's
    // own README/title-derivation heuristics inside buildAssignmentPlan.
    const caseStudyWeeks: ScheduleWeekPlan[] = bundles.map((bundle, index) => ({
      week: weekMap.get(bundle.name) ?? index + 1,
      topic: humanizeAssignmentName(bundle.name),
      summary: bundle.content.slice(0, 500),
      assignmentTitle: null,
      assignmentSlug: null,
      testName: null,
    }));
    // Group F, decision 4 - see CaseStudyPlanDiagnostics (case-study-plan.ts)
    // and its sibling wiring in course-planning.ts (the schedule-driven
    // path); this zip-driven path is the other genuine multi-week "run" in
    // this codebase, so it gets the same exhaustion reporting.
    const caseStudyDiagnostics: CaseStudyPlanDiagnostics = { exhaustedWeeks: [] };
    const caseStudyPlan = await planCourseCaseStudies(caseStudyWeeks, "", provider, "coding", caseStudyDiagnostics);

    // Generate each assignment's module, bounding how many run at once (each
    // makes three LLM calls) to stay under the provider's rate limit; the
    // transport layer additionally retries transient failures.
    const LECTURE_PLAN_CONCURRENCY = 4;
    const plans = await mapWithConcurrency(bundles, LECTURE_PLAN_CONCURRENCY, (bundle, index) =>
      buildAssignmentPlan(
        bundle,
        index,
        lectureDurationMinutes,
        templates,
        provider,
        bundles.length,
        caseStudyPlan.get(weekMap.get(bundle.name) ?? index + 1),
        sequenceOpenerBeforeDeck
      )
    );

    if (plans.length === 0) {
      return { error: "No assignments could be generated from the uploaded zip." };
    }

    const exhaustedWeekNumbers = new Set(caseStudyDiagnostics.exhaustedWeeks);
    for (const plan of plans) {
      const week = weekMap.get(plan.assignmentName);
      if (week !== undefined) {
        plan.label = renumberWeekLabel(plan.label, week);
        plan.presentationTitle = renumberWeekLabel(plan.presentationTitle, week);
        plan.weekNumber = week;
      }
      if (exhaustedWeekNumbers.has(plan.weekNumber)) {
        plan.caseStudyLibraryExhausted = true;
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

    // Normalize week numbers to match the course schedule, same as
    // generateLecturePlansAction - computed here (moved up) so the
    // single-week case-study match below can key off the same normalized
    // number this action later stamps onto plan.weekNumber.
    const weekMap = assignWeekNumbers(folders);
    const weekNumber = weekMap.get(slug) ?? index + 1;

    // Z1 (Group Z): this single-assignment regen has no visibility into the
    // OTHER assignments in the zip (only this one bundle is extracted), so
    // there is no cross-assignment exclusion list to build here - the same
    // "no other week has generated yet" degraded-but-not-fatal state this
    // codebase already accepts for a single-week caller elsewhere (see
    // buildScheduleWeekPlan's own usedCaseStudies default). A single-entry
    // plan still gives this one deck a verified, code-owned case instead of
    // leaving the model to pick its own with no library backing it.
    const caseStudyPlan = await planCourseCaseStudies(
      [
        {
          week: weekNumber,
          topic: humanizeAssignmentName(slug),
          summary: bundle.content.slice(0, 500),
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ],
      "",
      provider,
      "coding"
    );

    // Preserve the assignment's natural ordering (its position in the sorted
    // folder list) so a single module sorts correctly if merged into a list.
    const plan = await buildAssignmentPlan(
      bundle,
      index,
      lectureDurationMinutes,
      templates,
      provider,
      folders.length,
      caseStudyPlan.get(weekNumber)
    );

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
