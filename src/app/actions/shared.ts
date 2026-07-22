import type { SlideData, AssignmentPlan } from "../actions-types";
import { SLIDE_DECK_JSON_SHAPE, SLIDE_STRUCTURE_REQUIREMENTS } from "@/lib/slide-prompt";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { scaffoldModuleIntroDoc, scaffoldAssignmentDoc } from "@/lib/embedded/docs";
import { callLlm, type LlmProvider, type LlmPart } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { humanizeAssignmentName, stripAssignmentSlugPrefix, looksLikeAssignmentSlug } from "@/lib/assignment-name";
import { getUserStyle } from "@/lib/user-style";
import { PROMPT_PREFIX, RESPONSE_PREFIX } from "@/lib/writing-style-prompts";
import type JSZip from "jszip";


// Standard submission guidance appended to every repo-generated assignment instruction
export const REPO_SUBMISSION_GUIDANCE = `

## Getting Started

Open the README.md file at the root of your repository first - it explains the project layout and any setup steps you need before you write code.

## Submitting Your Work

1. Commit your work as you go with clear commit messages.
2. Push your commits to your GitHub repository.
3. Copy your repository link (it looks like https://github.com/your-username/your-repo) and paste it into the Canvas assignment as your submission.`;


// Normalize a parsed slide from the model into SlideData, carrying through an
// optional example code block when present. Shared by every Gemini slide path
// so code slides are handled identically everywhere.
export function toSlideData(
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
export function propagateExampleCodeToFollowups(slides: SlideData[]): SlideData[] {
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

/**
 * Extract the first JSON object from a text string, handling optional ```json fence.
 * Returns the substring from the first '{' to the last '}', or null if not found.
 */
export function jsonObjectSlice(text: string): string | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** Parse the first JSON object out of an LLM response (strips a ``` fence). */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const jsonText = jsonObjectSlice(text);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Pull textbook / course-materials details out of uploaded screenshots using the
 * vision model, as a plain-text block for the syllabus materials section. Returns
 * "" when there are no images, the model fails, or nothing was found.
 */
export async function extractTextbookInfoFromImages(
  images: Array<{ base64: string; mimeType: string }>,
  provider: LlmProvider
): Promise<string> {
  if (images.length === 0) return "";
  const parts: LlmPart[] = [
    {
      text: `The image(s) are screenshots of textbook / course-materials information. Extract every relevant detail and return it as a concise plain-text block for a syllabus "Required textbooks and materials" section. Include, when present: title, author(s), edition, publisher, year, ISBN, format (print/ebook/online), and whether each item is required or optional. Omit any field that is absent. If there are several items, list each one. Return ONLY the extracted details as plain text with no preamble and no markdown headings. If the image contains no textbook or materials information, return exactly: NONE`,
    },
  ];
  for (const img of images) {
    if (img.base64 && img.mimeType) parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }
  const r = await callLlm(
    { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 1024 } },
    provider
  );
  if (!r.ok) return "";
  const text = r.text.trim();
  return !text || /^none$/i.test(text) ? "" : text;
}

/**
 * Get the writing style block to inject into LLM prompts.
 * Returns "" if no sample, else a block with truncated sample.
 */
export async function getWritingStyleBlock(userId: string): Promise<string> {
  try {
    const supabase = createServiceClient();
    const style = await getUserStyle(supabase, userId);
    if (!style?.writingSample) {
      return "";
    }

    let sample = style.writingSample;

    // Strip the prompt scaffolding: PROMPT lines are dropped entirely and
    // the RESPONSE label is removed from response lines, so only the
    // instructor's own prose feeds the style sample.
    const lines = sample.split("\n");
    const filtered = lines
      .filter((line) => !line.startsWith(PROMPT_PREFIX))
      .map((line) => (line.startsWith(RESPONSE_PREFIX) ? line.slice(RESPONSE_PREFIX.length).trimStart() : line));
    sample = filtered.join("\n").trim();

    if (!sample) {
      return "";
    }

    // Truncate to 1500 chars
    if (sample.length > 1500) {
      sample = sample.slice(0, 1500) + "...";
    }

    return `\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE (tone, rhythm, vocabulary) shown in this sample:\n${sample}`;
  } catch {
    return "";
  }
}


export function buildStrictTemplateBlock(templateText: string): string {
  if (!templateText.trim()) return "";
  return `\n\nSTRICT TEMPLATE TO FOLLOW (this takes ABSOLUTE PRECEDENCE over every other structural instruction in this prompt):\n${templateText}\n\nTEMPLATE RULES (mandatory):\n- Reproduce the template's exact section headings, wording of headings, and their order. Do not add, remove, rename, merge, split, or reorder any section.\n- Match the template's formatting, heading style, capitalization, numbering/bullet conventions, tone, and overall structure precisely.\n- The template marks bulleted list items with a leading "- " and numbered list items with a leading "1. ", "2. ", etc. Wherever the template uses these list markers, your output MUST use the same list markers (start each such line with "- " for bullets or "N. " for numbered items). Wherever the template uses ordinary paragraphs, keep them as paragraphs with no list marker.\n- Replace any placeholder text in the template (e.g. bracketed prompts, sample text, "TODO", "[...]") with real content tailored to this assignment.\n- Preserve any fixed/boilerplate wording in the template verbatim.\n- If a default section described elsewhere in this prompt is not present in the template, only include it if the template has a clearly appropriate place for it; otherwise omit it. The template's structure wins in every conflict.`;
}

export async function generateSlidesForAssignment(
  assignmentName: string,
  content: string,
  lectureDurationMinutes: number,
  provider: LlmProvider
): Promise<{ presentationTitle: string; slides: SlideData[] } | { error: string }> {
  // Embedded Deterministic Engine: template a deck outline from the content.
  if (provider === "embedded") {
    return scaffoldLessonPlan(content);
  }

  const prompt = `You are an expert educator creating a lecture slide deck for a programming course assignment. The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

ASSIGNMENT: ${assignmentName}
LECTURE DURATION: ${lectureDurationMinutes} minutes

ASSIGNMENT CONTENT:
${content}

Based on the assignment content above, create a complete lecture slide deck that teaches students the concepts they need to understand and complete this assignment. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).

Return ONLY valid JSON:
${SLIDE_DECK_JSON_SHAPE}

Requirements:
- Cover the concepts introduced in the README or assignment description, highlight what students must implement, and explain any relevant patterns shown in the unit tests or code comments.
${SLIDE_STRUCTURE_REQUIREMENTS}`;

  // The parse below is guarded and retried once because a thrown parse error
  // would bypass buildAssignmentPlan's slidesFailed tolerance and fail the
  // entire generation run.
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
      return { error: `LLM API error for "${assignmentName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      if (attempt === 1) {
        console.error(`Slide JSON parse failed for "${assignmentName}" (attempt 1): no JSON object in the response`);
        continue;
      }
      return { error: `Could not parse slide data for "${assignmentName}".` };
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
          `Slide JSON parse failed for "${assignmentName}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
      return { error: `Could not parse slide data for "${assignmentName}".` };
    }
  }

  if (!parsed) {
    return { error: `Could not parse slide data for "${assignmentName}".` };
  }

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

export async function generateModuleIntroForAssignment(
  assignmentName: string,
  displayTitle: string,
  content: string,
  templateText = "",
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  // Embedded Deterministic Engine: template the module-intro document.
  if (provider === "embedded") {
    return { text: scaffoldModuleIntroDoc(displayTitle, content) };
  }

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

export async function generateAssignmentInstructionsForAssignment(
  assignmentName: string,
  displayTitle: string,
  readmeContent: string,
  templateText = "",
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  // Embedded Deterministic Engine: template the assignment instruction sheet.
  if (provider === "embedded") {
    return { text: scaffoldAssignmentDoc(displayTitle, readmeContent) };
  }

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
6. End with a "Deliverables" section that describes what must be completed and submitted (e.g., files to implement, tests to pass).
7. Format every section heading (other than the document title) as a markdown level-2 heading (e.g. "## Instructions"). For any list, start each item on its own line with a hyphen ("- "); NEVER use numbered lists (no "1.", "2.", etc.). Do not use any other markdown symbols (no bold or italics) in the body text.
8. Write in clear, direct language appropriate for undergraduate students.

Do not invent requirements not present in the README. If the README is sparse, note that students should contact the instructor (for example during office hours) for clarification. Never tell students to use, post on, check, or refer to a course discussion board, forum, or message board anywhere in the document. The "Helpful Free Resources" section should always be included regardless of how sparse the README is. Do not include submission instructions - a standard submission section is appended automatically.${buildStrictTemplateBlock(templateText)}`;

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

/**
 * Map over `items` running at most `limit` tasks concurrently, preserving order.
 * The lecture-plan generator makes three LLM calls per assignment; without a cap
 * a large course fires dozens of Gemini requests at once and trips the per-minute
 * rate limit, which (before retries existed) silently dropped whole assignments.
 */
export async function mapWithConcurrency<T, R>(
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

export const ASSIGNMENTS_FOLDER_PATTERN =
  /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;

export const COURSE_TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c",
  ".h", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".r", ".sql",
  ".sh", ".yaml", ".yml", ".json", ".html", ".css", ".scss",
]);

export const ASSIGNMENT_MAX_FILE_CHARS = 3000;
export const ASSIGNMENT_MAX_TOTAL_CHARS = 12000;

export interface AssignmentContentBundle {
  name: string;
  content: string;
  readmeContent: string;
}

export interface LectureTemplates {
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
export function findAssignmentsPrefix(allPaths: string[]): string {
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
export function listAssignmentFolders(allPaths: string[], prefix: string): string[] {
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
export async function extractAssignmentContentBundle(
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

/**
 * Generate the full module (slides + module intro + assignment instructions) for
 * one assignment from its extracted content. Shared by the "generate all" and
 * "generate one" paths so output format and failure handling stay identical.
 */
export async function buildAssignmentPlan(
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

  // Append submission guidance to instructions, guarded against double-appending
  let finalInstructions = "error" in instructionsResult ? "" : instructionsResult.text;
  if (finalInstructions.trim() && !finalInstructions.includes("Submitting your work")) {
    finalInstructions += REPO_SUBMISSION_GUIDANCE;
  }

  return {
    assignmentName: name,
    slides,
    slidesFailed,
    // Use the clean human title for the deck.
    presentationTitle: displayTitle,
    label,
    moduleIntroduction: "error" in introResult ? "" : introResult.text,
    assignmentInstructions: finalInstructions,
    weekNumber,
    introTemplateHeadings: templates.introTemplateHeadings,
    instructionsTemplateHeadings: templates.instructionsTemplateHeadings,
  } satisfies AssignmentPlan;
}

// ── Assignment instruction sync (Canvas <-> repo) ─────────────────────────────

export const assignmentSlug = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "assignment";
