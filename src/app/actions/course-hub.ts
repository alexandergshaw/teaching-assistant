"use server";

import type { SyllabusInputField, SyllabusCourseInfo } from "../actions-types";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { scaffoldSyllabusFields } from "@/lib/embedded/syllabus";
import { copyedit } from "@/lib/embedded/scaffold";
import { getCourseInfo, exportCourseCartridge, getCourseNotifications } from "@/lib/canvas";
import { listPreconfiguredInstitutionCodes } from "@/lib/canvas-core";
import type { RunSpan } from "@/lib/office-edit";
import { parseOfficeParagraphs, applyOfficeSections } from "@/lib/office-edit";
import { buildDocxFromPlainText } from "@/lib/docx";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { getCredentials, deleteCredentials } from "@/lib/google-credentials";
import { loadInstitutionFields, saveInstitutionFields, listAllInstitutionFields, type InstitutionField } from "@/lib/institution-fields";
import { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, type SyllabusTemplateMeta, type SyllabusTemplate } from "@/lib/supabase/syllabus-templates";
import { listSyllabi, getSyllabus, createSyllabus, renameSyllabus, deleteSyllabus, type FinalizedSyllabusMeta, type FinalizedSyllabus } from "@/lib/supabase/course-syllabi";
import { listCourses as listCourseHubRows, createCourse as createCourseRow, updateCourse as updateCourseRow, deleteCourse as deleteCourseRow, updateCourseMaterials, updateCourseCsv, updateCourseRubric, appendCourseMaterialFile, removeCourseMaterialFile, appendCourseExportFile, removeCourseExportFile, type Course as CourseHub, type CourseInput as CourseHubInput } from "@/lib/supabase/courses";
import { extractJsonObject, extractTextbookInfoFromImages } from "./shared";


// ── Adapt an existing syllabus from a codebase ──────────────────────────────

/** One class-specific paragraph of a syllabus the instructor should fill in. */

/** Render the instructor's course facts as a prompt block (empty when none given). */
function courseInfoBlock(info: SyllabusCourseInfo): string {
  const lines = [
    info.courseName ? `Course name/title: ${info.courseName}` : "",
    info.courseCode ? `Course code/number: ${info.courseCode}` : "",
    info.instructorName ? `Instructor name: ${info.instructorName}` : "",
    info.instructorEmail ? `Instructor email: ${info.instructorEmail}` : "",
    info.courseDescription ? `Official course description (use this VERBATIM for the course description section): ${info.courseDescription}` : "",
    info.startDate ? `Course start date (compute any week/date schedule from this; do not reuse dates from the old syllabus): ${info.startDate}` : "",
    info.meetingDays ? `Meeting days: ${info.meetingDays}` : "",
    info.meetingTimes ? `Meeting times: ${info.meetingTimes}` : "",
    info.location ? `Meeting location: ${info.location}` : "",
    info.textbookInfo ? `Required textbooks / materials (use this VERBATIM for the textbook/materials section): ${info.textbookInfo}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "(none provided)";
}

// Shared guidance so the AI describes work generically and uses instructor facts.
const SYLLABUS_STYLE_RULES = `- When describing weekly tasks or content, use generic, domain-neutral language for the TYPE of work (e.g. "create tables", "write functions", "build an API endpoint") rather than the codebase's specific project nouns (e.g. do NOT write "create mission/moon tables" — write "create tables").
- Use the instructor-provided course facts above exactly where they apply (meeting info, and schedule dates derived from the start date).
- Do not invent specific facts (instructor name, room numbers, dates) that are neither provided above nor implied by the codebase; leave the original text for the instructor to fill in.`;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Week k: Mon D - Mon D" lines computed exactly from a YYYY-MM-DD start date. */
function computeWeekDates(startDate: string | undefined, weeks: number): string {
  if (!startDate) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate.trim());
  if (!m) return "";
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const lines: string[] = [];
  for (let k = 0; k < weeks; k += 1) {
    const s = new Date(base + k * 7 * 86_400_000);
    const e = new Date(base + (k * 7 + 6) * 86_400_000);
    lines.push(`Week ${k + 1}: ${MONTH_ABBR[s.getUTCMonth()]} ${s.getUTCDate()} - ${MONTH_ABBR[e.getUTCMonth()]} ${e.getUTCDate()}`);
  }
  return lines.join("\n");
}

/** Summarize a codebase zip (file tree, per-week topics, key files, and any
 *  explicit schedule/outline the repo contains) as LLM context. */
async function summarizeCodebaseZip(zipBase64: string): Promise<string> {
  const JSZipMod = (await import("jszip")).default;
  const zip = await JSZipMod.loadAsync(Buffer.from(zipBase64, "base64"));
  const paths: string[] = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) paths.push(relativePath);
  });
  const tree = paths.slice(0, 250).join("\n");

  // Read a zip entry as bounded text, or "" if missing/unreadable.
  const readText = async (p: string, max: number): Promise<string> => {
    const entry = zip.file(p);
    if (!entry) return "";
    try {
      return (await entry.async("string")).slice(0, max);
    } catch {
      return "";
    }
  };

  // Top-level entries (folders/files at the repo root), in natural order — these
  // are typically the per-week assignments, so list them so the AI can map them.
  const topLevel = Array.from(new Set(paths.map((p) => p.split("/")[0]).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  // A one-line topic per top-level folder, from its README/intro heading — so the
  // per-week entries carry real topics (course repos are often one folder = one
  // week), not just folder names.
  const firstHeading = (text: string): string => {
    for (const line of text.split(/\r?\n/)) {
      const t = line.replace(/^#+\s*/, "").trim();
      if (t) return t.slice(0, 120);
    }
    return "";
  };
  const READMEISH = /^(readme|index|topic|overview)[^/]*\.(md|markdown|txt|rst)$/i;
  const topicLines: string[] = [];
  for (const dir of topLevel.slice(0, 20)) {
    const readmePath = paths.find((p) => {
      const parts = p.split("/");
      return parts.length === 2 && parts[0] === dir && READMEISH.test(parts[1]);
    });
    if (!readmePath) continue;
    const heading = firstHeading(await readText(readmePath, 800));
    if (heading) topicLines.push(`${dir}: ${heading}`);
  }

  // Explicit schedule / course-outline files anywhere in the repo (by name). When
  // present, these carry the real weekly + topic schedule for THIS offering, so
  // pull them in with a generous budget as the authoritative schedule source.
  const SCHEDULE_RE =
    /(^|\/)[^/]*(schedule|weekly|outline|topics?|calendar|curriculum|agenda|course[-_]?plan|lesson[-_]?plan|syllabus)[^/]*\.(md|markdown|txt|rst|adoc|org|csv)$/i;
  const schedulePaths = paths.filter((p) => SCHEDULE_RE.test(p)).slice(0, 6);
  let scheduleContents = "";
  let scheduleBudget = 16000;
  for (const p of schedulePaths) {
    if (scheduleBudget <= 0) break;
    const text = await readText(p, Math.min(scheduleBudget, 8000));
    if (text) {
      scheduleContents += `\n--- ${p} ---\n${text}\n`;
      scheduleBudget -= text.length;
    }
  }

  const KEY_RE =
    /(^|\/)(readme(\.[a-z]+)?|package\.json|pyproject\.toml|requirements\.txt|setup\.py|cargo\.toml|go\.mod|pom\.xml|composer\.json|gemfile|index\.(md|html|js|ts))$/i;
  const keyPaths = paths.filter((p) => KEY_RE.test(p)).slice(0, 8);
  let keyContents = "";
  let budget = 12000;
  for (const p of keyPaths) {
    if (budget <= 0) break;
    const text = await readText(p, Math.min(budget, 4000));
    if (text) {
      keyContents += `\n--- ${p} ---\n${text}\n`;
      budget -= text.length;
    }
  }

  const topicsBlock = topicLines.length
    ? `\n\nPER-WEEK TOPICS (from each top-level folder's intro/readme):\n${topicLines.join("\n")}`
    : "";
  const scheduleBlock = scheduleContents
    ? `\n\nCOURSE SCHEDULE / OUTLINE FILES FOUND IN THE REPO (verbatim — the real weekly + topic schedule for this offering):${scheduleContents}`
    : "";
  return `TOP-LEVEL ENTRIES (in order — each is typically one weekly assignment):\n${topLevel.join("\n")}${topicsBlock}\n\nFILE TREE (truncated):\n${tree}\n\nKEY FILES:${keyContents || "\n(none found)"}${scheduleBlock}`;
}

/**
 * Read a former syllabus (.docx) and a codebase zip. Pass 1 identifies the
 * class-specific NON-schedule fields and the weekly-schedule block's bounds; pass
 * 2 produces a complete replacement for EVERY paragraph in that block, so the old
 * schedule is fully cleared and replaced. Returns the editable fields, the
 * schedule replacements, all paragraphs, and the codebase summary.
 */
export async function analyzeSyllabusInputsAction(
  syllabus: { name: string; base64: string },
  zipBase64: string | null,
  courseInfo: SyllabusCourseInfo = {},
  provider: LlmProvider = "gemini",
  textbookImages: Array<{ base64: string; mimeType: string }> | null = null
): Promise<
  | {
      fields: SyllabusInputField[];
      scheduleReplacements: Record<string, string>;
      paragraphs: Array<{ id: string; text: string; runs: RunSpan[] }>;
      codebaseSummary: string;
      textbookInfo: string;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    const buffer = Buffer.from(syllabus.base64, "base64");
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    if (paragraphs.length === 0) {
      return { error: "Could not read any text from that file. Upload the former syllabus as a Word .docx." };
    }
    const codebaseSummary = zipBase64 ? await summarizeCodebaseZip(zipBase64) : "(no codebase provided)";

    // Embedded Deterministic Engine: detect fields by matching "Label: value"
    // lines, pre-filling from the provided course facts. No model call, and no
    // weekly-schedule rewrite (out of reach for rule-based templating).
    if (provider === "embedded") {
      return {
        fields: scaffoldSyllabusFields(paragraphs, courseInfo),
        scheduleReplacements: {},
        paragraphs,
        codebaseSummary,
        textbookInfo: "",
      };
    }

    // Pull textbook details out of any uploaded screenshots, and fold them into
    // the course facts so the textbook/materials field is filled from them.
    const textbookInfo =
      textbookImages && textbookImages.length > 0
        ? await extractTextbookInfoFromImages(textbookImages, provider)
        : "";
    const combinedTextbook = [courseInfo.textbookInfo?.trim(), textbookInfo.trim()].filter(Boolean).join("\n\n");
    const info: SyllabusCourseInfo = combinedTextbook ? { ...courseInfo, textbookInfo: combinedTextbook } : courseInfo;

    const paraList = paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n");
    const byId = new Map(paragraphs.map((p) => [p.id, p.text]));

    // ── Pass 1: non-schedule class-specific fields + schedule block bounds. ──
    const prompt1 = `You are adapting an existing course syllabus for a new offering. The codebase is summarized so you know what the course is about.

CODEBASE SUMMARY:
${codebaseSummary}

INSTRUCTOR-PROVIDED COURSE FACTS:
${courseInfoBlock(info)}

The syllabus is a list of numbered paragraphs (id in brackets):
${paraList}

1) Identify the CLASS-SPECIFIC, NON-SCHEDULE paragraphs that need the instructor to provide or confirm a value — course title/number, instructor name, term/semester, meeting times and location, office hours, course description, learning objectives, textbooks/tools, grading breakdown, and similar. Leave generic boilerplate OUT (university policies, academic-integrity, accessibility/Title IX, etc.). Do NOT include weekly-schedule paragraphs here.

2) Locate the WEEKLY SCHEDULE / course outline block — the consecutive run of paragraphs that list the weeks, dates, topics, and weekly descriptions (often a table). INCLUDE every week in the block, including rows for exams, tests, quizzes, reviews, breaks, holidays, and finals — the block's LAST paragraph is the last such weekly row (for example a final-exam or review week), NOT the last row that happens to be labeled "Week N". Return the id of its FIRST and LAST paragraph. If there is no weekly schedule, use null for both.

Return ONLY valid JSON:
{
  "fields": [ { "paragraphId": "p12", "label": "Course title", "suggestedText": "..." } ],
  "scheduleStartId": "p81",
  "scheduleEndId": "p131"
}

Requirements:
- Use exact paragraphId values; suggestedText is the COMPLETE replacement for that paragraph.
${SYLLABUS_STYLE_RULES}
- Do not include any text outside the JSON object.`;

    const r1 = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt1 }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 8192 } },
      provider
    );
    if (!r1.ok) {
      return { error: `Analysis failed: HTTP ${r1.status} — ${r1.body.slice(0, 200)}` };
    }
    const parsed1 = extractJsonObject(r1.text);
    if (!parsed1) {
      return { error: "Could not parse the analysis result." };
    }

    const startId = typeof parsed1.scheduleStartId === "string" ? parsed1.scheduleStartId : "";
    const endId = typeof parsed1.scheduleEndId === "string" ? parsed1.scheduleEndId : "";
    const startIdx = paragraphs.findIndex((p) => p.id === startId);
    const endIdx = paragraphs.findIndex((p) => p.id === endId);
    const schedulePairs =
      startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx ? paragraphs.slice(startIdx, endIdx + 1) : [];
    const scheduleIds = new Set(schedulePairs.map((p) => p.id));

    const fields: SyllabusInputField[] = (Array.isArray(parsed1.fields) ? parsed1.fields : [])
      .map((f) => {
        const o = (f ?? {}) as { paragraphId?: unknown; label?: unknown; suggestedText?: unknown };
        const paragraphId = typeof o.paragraphId === "string" ? o.paragraphId : "";
        const currentText = byId.get(paragraphId) ?? "";
        const suggestedText =
          typeof o.suggestedText === "string" && o.suggestedText.trim() ? o.suggestedText.trim() : currentText;
        return {
          paragraphId,
          label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : "Field",
          currentText,
          suggestedText,
        };
      })
      .filter((f) => f.paragraphId && byId.has(f.paragraphId) && !scheduleIds.has(f.paragraphId));

    // ── Pass 2: a complete replacement for EVERY schedule paragraph. ──
    const scheduleReplacements: Record<string, string> = {};
    if (schedulePairs.length > 0) {
      const schedList = schedulePairs.map((p) => `[${p.id}] ${p.text}`).join("\n");
      // How many weeks to compute dates for. Besides explicit "Week N" numbers,
      // also count unnumbered term rows (exams, tests, quizzes, reviews, breaks,
      // finals) so a schedule whose last weeks are labeled "Final Exam" or "Review"
      // is not cut short. Overcounting is harmless (extra dates go unused);
      // undercounting drops the tail weeks.
      let maxWeek = 0;
      let specialWeeks = 0;
      for (const p of schedulePairs) {
        const wm = p.text.match(/week\s*(\d+)/i);
        if (wm) {
          maxWeek = Math.max(maxWeek, Number(wm[1]));
        } else if (/\b(midterm|finals?|exams?|quiz(?:zes)?|test|review|break|holiday|reading\s*day|no\s*class)\b/i.test(p.text)) {
          specialWeeks += 1;
        }
      }
      const weeks = Math.max(maxWeek + specialWeeks, Math.min(24, schedulePairs.length));
      const weekDates = computeWeekDates(courseInfo.startDate, weeks);
      const datesBlock = weekDates
        ? `EXACT WEEK DATES — use these verbatim and never any other date:\n${weekDates}\n\n`
        : "";

      const prompt2 = `You are completely rewriting the WEEKLY SCHEDULE of a course syllabus for a new offering. The previous offering's schedule must be entirely cleared and replaced.

CODEBASE SUMMARY:
${codebaseSummary}

INSTRUCTOR-PROVIDED COURSE FACTS:
${courseInfoBlock(info)}

${datesBlock}Here are the schedule paragraphs (id in brackets), in order:
${schedList}

Rewrite the schedule for THIS course. Return a NEW replacement for EVERY paragraph id above.

DATES — ${weekDates
        ? "Use ONLY the EXACT WEEK DATES listed above: a paragraph for week k uses week k's dates, in the SAME date style the paragraph already uses."
        : "Compute consecutive weekly dates from the course start date (week 1 begins on the start date), one week apart."} The previous offering's dates MUST NOT appear anywhere — every old date (for example any January/February/March/April dates that are not in the list above) must be replaced.

TOPICS — Use the codebase's real schedule for THIS offering, in this priority: (1) if a "COURSE SCHEDULE / OUTLINE FILES FOUND IN THE REPO" section is present, it is AUTHORITATIVE - take each week's topic, order, and description from it; (2) otherwise use the "PER-WEEK TOPICS" list (each top-level folder's topic), in order; (3) otherwise treat each TOP-LEVEL ENTRY as one week, in order. Week k's topic and description come from week k of that source. The previous offering's topics and descriptions MUST NOT appear anywhere - every old topic or description (anything not derived from THIS codebase) must be replaced.

ALL WEEKS — The schedule may run longer than the last numbered "Week N": treat EVERY weekly row as one consecutive week, in order, INCLUDING rows for exams, tests, quizzes, reviews, breaks, and finals. Rewrite and KEEP every one of them (update their dates from the list above); never stop early or drop the exam/review/final weeks. For an exam/test/quiz/review/break/final row, keep it as that kind of week (do not replace it with a codebase topic); map codebase topics only to the instructional weeks, in order.

FORMAT — Preserve each paragraph's role and layout (a "Week N (dates): topic" line stays that shape; a separate dates cell stays a dates cell; a topic/description cell stays a topic/description cell) — only the content changes.

Return ONLY valid JSON mapping each id to its new text:
{ "replacements": { "p81": "...", "p82": "..." } }

Requirements:
- Include a replacement for EVERY id listed above; do not omit a single one.
- Do not keep ANY date, topic, or description from the previous offering.
${SYLLABUS_STYLE_RULES}
- Do not include any text outside the JSON object.`;

      const r2 = await callLlm(
        { contents: [{ role: "user", parts: [{ text: prompt2 }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 16384 } },
        provider
      );
      if (r2.ok) {
        const parsed2 = extractJsonObject(r2.text);
        const reps =
          parsed2 && typeof parsed2.replacements === "object" && parsed2.replacements
            ? (parsed2.replacements as Record<string, unknown>)
            : {};
        const returnedAny = Object.keys(reps).length > 0;
        for (const p of schedulePairs) {
          const v = reps[p.id];
          if (typeof v === "string" && v.trim()) scheduleReplacements[p.id] = v.trim();
          // Clear any schedule paragraph the model skipped so no old date/topic survives
          // (only when it returned something — never blank the whole schedule on a failure).
          else if (returnedAny) scheduleReplacements[p.id] = "";
        }
      }
    }

    if (fields.length === 0 && Object.keys(scheduleReplacements).length === 0) {
      return { error: "No class-specific sections were identified in that syllabus." };
    }
    return {
      fields,
      scheduleReplacements,
      paragraphs: paragraphs.map((p) => ({ id: p.id, text: p.text, runs: p.runs })),
      codebaseSummary,
      textbookInfo,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Regenerate the replacement text for a single syllabus field, using the codebase
 * summary and instructor facts. Returns just the new paragraph text.
 */
export async function regenerateSyllabusFieldAction(
  field: { label: string; currentText: string },
  codebaseSummary: string,
  courseInfo: SyllabusCourseInfo = {},
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: no model to rewrite a field, so keep the
    // current text; the instructor edits it directly.
    if (provider === "embedded") {
      return { text: field.currentText };
    }

    const prompt = `You are writing the replacement text for ONE field of a course syllabus being adapted for a new offering.

CODEBASE SUMMARY:
${codebaseSummary}

INSTRUCTOR-PROVIDED COURSE FACTS:
${courseInfoBlock(courseInfo)}

FIELD: ${field.label}
CURRENT TEXT IN THE SYLLABUS:
${field.currentText}

Write a fresh, complete replacement for this one paragraph for the new offering. Keep the original's style, labels, and approximate length; only change the class-specific content.

${SYLLABUS_STYLE_RULES}

Return ONLY the replacement paragraph text — no JSON, no quotes, no commentary.`;

    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } },
      provider
    );
    if (!result.ok) {
      return { error: `Regeneration failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }
    let text = result.text.trim();
    const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (fenced) text = fenced[1].trim();
    if (!text) {
      return { error: "The model returned empty text." };
    }
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Rewrite a single paragraph of an Office document with AI. The whole document's
 * text is given as context so the rewrite fits in; only the named paragraph is
 * rewritten and its plain text returned (no formatting).
 */
export async function rewriteOfficeParagraphAction(
  documentText: string,
  paragraphText: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!paragraphText.trim()) return { error: "There is no text in this paragraph to rewrite." };

    // Embedded Deterministic Engine: copy-edit the paragraph by rule (cut wordy
    // phrases and filler, fix punctuation and casing) instead of a model rewrite.
    if (provider === "embedded") {
      return { text: copyedit(paragraphText) };
    }

    const prompt = `You are editing one paragraph of a document. Here is the full document for context:

---
${documentText.slice(0, 12000)}
---

Rewrite ONLY this paragraph so it is clearer and well written, keeping its meaning, role, and approximate length, and matching the document's tone:

"""
${paragraphText}
"""

Return ONLY the rewritten paragraph text — no JSON, no quotes, no commentary.`;

    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } },
      provider
    );
    if (!result.ok) {
      return { error: `Rewrite failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }
    let text = result.text.trim();
    const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (fenced) text = fenced[1].trim();
    text = text.replace(/^"|"$/g, "").trim();
    if (!text) return { error: "The model returned empty text." };
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Rebuild the syllabus .docx from the instructor's ordered sections — supporting
 * edited, deleted, and added paragraphs while preserving the original formatting —
 * and return the new file as base64. Each section names the source paragraph id
 * whose style it borrows; a known paragraph absent from the list is removed.
 */
export async function buildAdaptedSyllabusAction(
  syllabusBase64: string,
  sections: Array<{ sourceId: string; spans: RunSpan[] }>
): Promise<{ base64: string } | { error: string }> {
  try {
    await requireOwner();
    const buffer = Buffer.from(syllabusBase64, "base64");
    const out = await applyOfficeSections("docx", buffer, sections);
    return { base64: out.toString("base64") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not build the syllabus." };
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

// ── Closed-LMS integration suite (CHUNK E) ──────────────────────────────────

/** E1: Fetch an ICS feed from a URL (calendar export). */
export async function fetchIcsFeedAction(url: string): Promise<{ ics: string } | { error: string }> {
  try {
    await requireOwner();

    const parsedUrl = new URL(url);
    if (!parsedUrl.protocol.match(/^https?:$/)) {
      return { error: "Calendar feed URL must be http or https." };
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "teaching-assistant/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: `Failed to fetch calendar feed: HTTP ${response.status}` };
    }

    const text = await response.text();

    if (text.length > 2_000_000) {
      return { error: "The feed is too large." };
    }

    return { ics: text };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not fetch the calendar feed.",
    };
  }
}

/** E2: Save institution field definitions (e.g. calendar feed URLs). */
export async function saveInstitutionFieldsAction(
  acronym: string,
  fields: InstitutionField[]
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await saveInstitutionFields(supabase, user.id, acronym, fields);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save institution fields.",
    };
  }
}

/** E3: List institutions that have calendar feeds configured. */
export async function listInstitutionsWithFeedsAction(): Promise<
  { institutions: Array<{ acronym: string; feedUrls: string[] }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const allInstitutions = await listAllInstitutionFields(supabase, user.id);

    const institutions = allInstitutions
      .map(({ acronym, fields }) => {
        const feedUrls = fields
          .filter((f) => f.id.startsWith("calendarFeedUrl") && f.value.trim())
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((f) => f.value.trim());

        return { acronym, feedUrls };
      })
      .filter((i) => i.feedUrls.length > 0);

    return { institutions };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list institutions with feeds.",
    };
  }
}

/** E4: Get calendar feed URLs for one institution. */
export async function listInstitutionFeedUrlsAction(acronym: string): Promise<
  { feedUrls: string[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const fields = await loadInstitutionFields(supabase, user.id, acronym);

    const feedUrls = fields
      .filter((f) => f.id.startsWith("calendarFeedUrl") && f.value.trim())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((f) => f.value.trim());

    return { feedUrls };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list institution feed URLs.",
    };
  }
}

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

// ── Course hub (bundle a course's resources: codebase, syllabus, textbook, Canvas) ──
// Named "CourseHub" to avoid collision with the Canvas listCoursesAction above.

/** List the owner's saved courses. */
export async function listCourseHubAction(): Promise<{ courses: CourseHub[] } | { error: string }> {
  try {
    const user = await requireOwner();
    return { courses: await listCourseHubRows(user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list your courses." };
  }
}

/** Create a course. */
export async function createCourseHubAction(input: CourseHubInput): Promise<{ course: CourseHub } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!input.name?.trim()) return { error: "Enter a course name." };
    return { course: await createCourseRow(user.id, input) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the course." };
  }
}

/** Update a course. */
export async function updateCourseHubAction(
  id: string,
  input: CourseHubInput
): Promise<{ course: CourseHub } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a course." };
    if (!input.name?.trim()) return { error: "Enter a course name." };
    return { course: await updateCourseRow(user.id, id, input) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course." };
  }
}

/** Delete a course. */
export async function deleteCourseHubAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a course." };
    await deleteCourseRow(user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the course." };
  }
}

/** Update a course's materials zip metadata. */
export async function setCourseMaterialsAction(
  courseId: string,
  fields: {
    materialsZipName: string | null;
    materialsZipPath: string | null;
    materialsZipSize: number | null;
  }
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseMaterials(user.id, courseId, fields);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course materials." };
  }
}

/** Update a course's CSV metadata. */
export async function setCourseCsvAction(
  courseId: string,
  csvName: string | null,
  csvData: string | null
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseCsv(user.id, courseId, { csvName, csvData });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course schedule CSV." };
  }
}

/** Update a course's rubric metadata. */
export async function setCourseRubricAction(
  courseId: string,
  rubricName: string | null,
  rubricData: string | null
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseRubric(user.id, courseId, { rubricName, rubricData });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course rubric." };
  }
}

/** Append a material file to a course's materials list. Returns the storage path of any replaced entry. */
export async function appendCourseMaterialFileAction(
  courseId: string,
  file: { name: string; path: string; size: number }
): Promise<{ replacedPath: string | null } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    const replacedPath = await appendCourseMaterialFile(user.id, courseId, {
      ...file,
      addedAt: new Date().toISOString(),
    });
    return { replacedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to the course materials." };
  }
}

/** Remove a material file from a course's materials list. */
export async function removeCourseMaterialFileAction(
  courseId: string,
  path: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await removeCourseMaterialFile(user.id, courseId, path);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the file from the course materials." };
  }
}

/** Append an export file to a course's exports list. Returns the storage object paths of any replaced entry. */
export async function appendCourseExportFileAction(
  courseId: string,
  file: { name: string; path: string; size: number; parts?: string[] }
): Promise<{ replacedPaths: string[] } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    const replacedPaths = await appendCourseExportFile(user.id, courseId, {
      ...file,
      addedAt: new Date().toISOString(),
    });
    return { replacedPaths };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to the course exports." };
  }
}

/** Remove an export file from a course's exports list. */
export async function removeCourseExportFileAction(
  courseId: string,
  path: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await removeCourseExportFile(user.id, courseId, path);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the file from the course exports." };
  }
}

/** Per-course LMS notification counts (needs-grading + unread inbox) for its tile. */
export async function getCourseNotificationsAction(
  canvasUrl: string,
  institution?: string
): Promise<{ needsGrading: number; unread: number } | { error: string }> {
  try {
    await requireOwner();
    const match = canvasUrl.match(/\/courses\/(\d+)/);
    if (!match) return { error: "Course URL must look like .../courses/123." };
    const code = institution?.trim();
    if (!code) return { error: "Set this course's institution to load notifications." };
    return await getCourseNotifications(code, match[1]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load notifications." };
  }
}

/** Fetch course metadata from the LMS: name, start date, and syllabus HTML. */
export async function getCourseInfoAction(
  courseUrl: string,
  acronym?: string
): Promise<{ name: string; startAt: string | null; syllabusBody: string } | { error: string }> {
  try {
    await requireOwner();
    return await getCourseInfo(courseUrl, acronym?.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load course information." };
  }
}

/** Export a course as an IMS Common Cartridge from the LMS. */
export async function exportCourseCartridgeAction(
  courseUrl: string,
  acronym?: string
): Promise<{ fileName: string; base64: string } | { error: string }> {
  try {
    await requireOwner();
    return await exportCourseCartridge(courseUrl, acronym?.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not export the course from the LMS." };
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
 * Every institution the server actually has Canvas credentials for, derived
 * from the `<ACRONYM>_CANVAS_URL` / `<ACRONYM>_CANVAS_API_TOKEN` env vars. This
 * is the ONLY institution list available server-side (the acronym registry
 * otherwise lives in client localStorage), so it is what "all institutions"
 * options resolve to for unattended runs and event triggers.
 */
export async function listConfiguredInstitutionsAction(): Promise<
  { acronyms: string[] } | { error: string }
> {
  try {
    await requireOwner();
    const acronyms = new Set<string>();
    for (const key of Object.keys(process.env)) {
      const m = /^([A-Z][A-Z0-9]*)_CANVAS_URL$/.exec(key);
      if (!m) continue;
      const code = m[1];
      if (process.env[key] && process.env[`${code}_CANVAS_API_TOKEN`]) {
        acronyms.add(code);
      }
    }
    // Also include hardcoded institutions that derive their host and so work
    // with only a token set (no `<CODE>_CANVAS_URL`); env scanning alone would
    // miss them, making "all institutions" narrower than what actually works.
    for (const code of listPreconfiguredInstitutionCodes()) {
      acronyms.add(code);
    }
    return { acronyms: [...acronyms].sort() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list institutions." };
  }
}
