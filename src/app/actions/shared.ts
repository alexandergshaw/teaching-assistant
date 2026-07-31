import type { SlideData, AssignmentPlan } from "../actions-types";
import { slideDeckJsonShape, slideStructureRequirements, enforceNoCodeForApplied } from "@/lib/slide-prompt";
import { coerceSlideGraphic } from "@/lib/slide-graphics";
import { courseKindContract, courseKindNoun, COMMITTED_TOOLSET_RULE, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT, CONCRETE_DIRECTION_CONTRACT } from "@/lib/artifact-voice";
import { BLOOM_OBJECTIVES_CONTRACT } from "@/lib/bloom-taxonomy";
import { renderMilestoneContract, projectChoiceContract, type MilestoneBrief } from "@/lib/course-project";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { scaffoldModuleIntroDoc, scaffoldAssignmentDoc, scaffoldModuleObjectivesDoc } from "@/lib/embedded/docs";
import { callLlm, type LlmProvider, type LlmPart } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { humanizeAssignmentName, stripAssignmentSlugPrefix, looksLikeAssignmentSlug } from "@/lib/assignment-name";
import { getUserStyle } from "@/lib/user-style";
import { PROMPT_PREFIX, RESPONSE_PREFIX } from "@/lib/writing-style-prompts";
import { stripModelUrls } from "@/lib/urls";
import { renderToolsYouWillUseSection, renderHelpfulFreeResourcesSection } from "@/lib/resource-links";
import type JSZip from "jszip";

// requiredTools arrives as a single semicolon-joined string (e.g. "Trello
// (free plan); Excel (free trial)" - see the requiredTools parameter comment
// on generateAssignmentInstructionsForAssignment below for where that shape
// comes from). renderToolsYouWillUseSection wants the individual tool names
// as an array; this is the one place that split happens; both
// generateAssignmentInstructionsForAssignment and
// generateModuleObjectivesForAssignment reuse it so the split can never mean
// something slightly different in one call site than the other.
function splitToolList(requiredTools: string): string[] {
  return requiredTools
    .split(";")
    .map((name) => name.trim())
    .filter(Boolean);
}

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
  raw: {
    title?: string;
    bullets?: string[];
    code?: string;
    codeLanguage?: string;
    notes?: string;
    graphic?: unknown;
  },
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
  if (typeof raw.notes === "string" && raw.notes.trim()) {
    slide.notes = raw.notes.trim();
  }
  const graphic = coerceSlideGraphic(raw.graphic);
  if (graphic) {
    slide.graphic = graphic;
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
  provider: LlmProvider,
  // This function is reached only from buildAssignmentPlan below, which is
  // repo-driven (READMEs, unit tests extracted from an uploaded zip) and is
  // therefore inherently a programming deck - buildAssignmentPlan passes
  // "coding" explicitly (see the comment there) rather than relying on this
  // default silently. The parameter still exists, and this generator is
  // still fully kind-aware, so a future repo-driven applied path would not
  // have to rediscover this bug.
  courseKind: CourseKind = "coding"
): Promise<{ presentationTitle: string; slides: SlideData[]; codeViolations?: number } | { error: string }> {
  // Embedded Deterministic Engine: template a deck outline from the content.
  if (provider === "embedded") {
    return scaffoldLessonPlan(content);
  }

  const prompt = `You are an expert educator creating a lecture slide deck for a course assignment. The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

${courseKindContract(courseKind)}

ASSIGNMENT: ${assignmentName}
LECTURE DURATION: ${lectureDurationMinutes} minutes

ASSIGNMENT CONTENT:
${content}

Based on the assignment content above, create a complete lecture slide deck that teaches students the concepts they need to understand and complete this assignment. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).

Return ONLY valid JSON:
${slideDeckJsonShape(courseKind)}

Requirements:
- Cover the concepts introduced in the README or assignment description, highlight what students must implement, and explain any relevant patterns shown in the unit tests or code comments.
${slideStructureRequirements(courseKind)}`;

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

  // AC2: defense in depth against the same prompt regression, even though
  // this path always passes "coding" today (see the courseKind comment above).
  const guard = enforceNoCodeForApplied(slides, courseKind);
  if (guard.violations > 0) {
    console.error(
      `Applied no-code guard: stripped code from ${guard.violations} slide(s) for "${assignmentName}" - the model returned code despite the applied contract forbidding it.`
    );
  }

  return {
    presentationTitle: parsed.presentationTitle ?? assignmentName,
    slides: guard.slides,
    codeViolations: guard.violations,
  };
}

export async function generateModuleIntroForAssignment(
  assignmentName: string,
  displayTitle: string,
  content: string,
  templateText = "",
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding",
  // AC1/AC2: the module's already-generated assignment text
  // (buildScheduleWeekPlan's schedule-driven flow only - the repo-driven
  // buildAssignmentPlan omits this and is unaffected). "" (the default)
  // leaves the prompt exactly as it was before this parameter existed.
  upcomingAssignmentContext = ""
): Promise<{ text: string } | { error: string }> {
  // Embedded Deterministic Engine: template the module-intro document.
  if (provider === "embedded") {
    return { text: scaffoldModuleIntroDoc(displayTitle, content) };
  }

  const assignmentGroundingBlock = upcomingAssignmentContext.trim()
    ? `\n\nTHIS MODULE'S ASSIGNMENT (already written - the introduction must set students up to succeed at it, without repeating its instructions verbatim):\n${upcomingAssignmentContext.trim()}`
    : "";

  const prompt = `You are an expert educator writing a module introduction document for a ${courseKindNoun(courseKind)}.

${courseKindContract(courseKind)}

ASSIGNMENT / MODULE: ${displayTitle}

ASSIGNMENT CONTENT:
${content}${assignmentGroundingBlock}

Write a well-formatted module introduction for the week this assignment covers. The document should:
1. Start with a single document title on the very first line, written exactly as the markdown level-1 heading "# Module Introduction: ${displayTitle}". This must be the only level-1 heading in the document. Never use folder names, file paths, or identifiers like "review1" or "assignment3" as the title or any heading.
2. Open with an engaging overview of the topic and why it matters.
3. Include a section called "Real-World Applications" with at least 3 concrete, specific examples of how these concepts are used in practice by real organizations that students will recognise.
4. Include a brief section called "What You Will Learn" that lists the key skills and concepts students will gain.
5. Be written in clear, motivating language appropriate for undergraduate students.
6. Format every section heading (other than the document title) as a markdown level-2 heading (e.g. "## Real-World Applications"). Do not use any other markdown symbols (no bold, italics, or bullet asterisks) in the body text.
7. ${PLAIN_LANGUAGE_CONTRACT}

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

/**
 * Generate a MODULE OBJECTIVES document: what a student must be able to DO
 * by the end of this module, derived from its ASSIGNMENT rather than a
 * generic restatement of the topic (AC1 - "the assignment is what proves the
 * objective"). `assignmentText` is the module's already-generated assignment
 * (buildScheduleWeekPlan's assignmentContextForDownstream, or the
 * repo-driven buildAssignmentPlan's own generated instructions) - when it is
 * "" (generation failed, or a caller has none), the objectives fall back to
 * grounding in `fallbackContent` (the topic/summary or README/source text)
 * instead, exactly like generateModuleIntroForAssignment's own fallback -
 * never a fake "the assignment says..." grounding.
 *
 * Bloom's Taxonomy (docs/REGRESSION.md 145/146): every objective is required
 * to carry a measurable Bloom verb, a visible level tag, and - the rule that
 * outranks the other two - a level that matches what `assignmentText`
 * actually demands, not what would look most rigorous. See
 * BLOOM_OBJECTIVES_CONTRACT (src/lib/bloom-taxonomy.ts) for the exact rule,
 * pushed verbatim so this prompt and the deck/assignment prompts never state
 * it two different ways.
 */
export async function generateModuleObjectivesForAssignment(
  assignmentName: string,
  displayTitle: string,
  assignmentText: string,
  fallbackContent: string,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding",
  // AC5: the same real-tool commitment generateAssignmentInstructionsForAssignment
  // and generateSlidesFromTopic already respect for an applied week (selectRequiredTools,
  // course-planning-grounding.ts) - "" (the default) asks for nothing extra.
  requiredTools = "",
  // Bloom AC5 (progression): this module's position in the term, so the
  // model can judge how far toward Apply/Analyze/Evaluate/Create it is
  // reasonable to progress - the schedule-driven caller (buildScheduleWeekPlan)
  // always has both; the repo-driven caller (buildAssignmentPlan) has no
  // reliable notion of "how many weeks total" for a bare zip of assignment
  // folders unless its own caller supplies one. 0 (the default) omits the
  // term-position line entirely rather than asserting a fabricated position.
  weekNumber = 0,
  totalWeeks = 0
): Promise<{ text: string } | { error: string }> {
  const grounding = assignmentText.trim() || fallbackContent;

  // Embedded Deterministic Engine: template the objectives document. This
  // deterministic scaffold pulls its bullets from the input TEXT VERBATIM
  // (scaffoldModuleObjectivesDoc - "nothing is invented") and has no model
  // reasoning to judge a Bloom verb or level from - tagging one anyway would
  // mean fabricating an assessment the scaffold cannot actually make, which
  // is the one thing this deterministic path is designed never to do. Bloom
  // tagging is therefore a real (LLM) generation-only requirement; the
  // embedded fallback is unchanged.
  if (provider === "embedded") {
    return { text: scaffoldModuleObjectivesDoc(displayTitle, grounding) };
  }

  const groundingLabel = assignmentText.trim()
    ? "THIS MODULE'S ASSIGNMENT (derive every objective from exactly what this assignment requires a student to do)"
    : "MODULE CONTENT (no generated assignment text was available - derive the objectives from this instead)";

  const toolRequirement = requiredTools.trim()
    ? `\n6. REQUIRED TOOL(S): this module's assignment already commits students to the following practitioner tool(s): ${requiredTools.trim()}. At least one objective must name the specific tool the student uses it with, rather than describing the skill generically.`
    : "";

  // Bloom AC5: only asserted when both numbers are known and real (never
  // "week 0 of 0") - see the weekNumber/totalWeeks doc comment above.
  const termPositionBlock =
    weekNumber > 0 && totalWeeks > 0
      ? `\n7. TERM POSITION: this module is week ${weekNumber} of ${totalWeeks} in the term - weigh this when judging how far to progress toward higher Bloom levels (see the progression rule below; alignment with the assignment still wins any conflict).`
      : "";

  const prompt = `You are an expert educator writing a MODULE OBJECTIVES document for a ${courseKindNoun(courseKind)}.

${courseKindContract(courseKind)}

MODULE: ${displayTitle}

${groundingLabel}:
${grounding}

Write a module objectives document that states what a student must be able to DO by the end of this module - derived directly from what the assignment above requires, never a generic restatement of the topic. The document should:
1. Start with a single document title on the very first line, written exactly as the markdown level-1 heading "# Module Objectives: ${displayTitle}". This must be the only level-1 heading in the document.
2. Open with one sentence framing why these objectives matter for this module.
3. Include a "## Learning Objectives" section: 4-6 objectives, each its own line starting with "- ", each directly tied to completing the assignment above. ${BLOOM_OBJECTIVES_CONTRACT}
4. Format the section heading as a markdown level-2 heading. Do not use any other markdown symbols (no bold, italics, or numbered lists) in the body text - the "(Bloom: Level)" tag at the end of each objective line is plain text, not a markdown symbol.
5. ${PLAIN_LANGUAGE_CONTRACT}${toolRequirement}${termPositionBlock}

Do not restate the assignment's instructions - describe only the skills and knowledge a student demonstrates by completing it.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for module objectives "${assignmentName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  if (!result.text.trim()) {
    return { error: `Module objectives generation returned empty response for "${assignmentName}".` };
  }

  // P1-AC1/AC4: the model must never author a URL in a student-facing
  // document - stripModelUrls is the last line of defense here exactly as it
  // is for the assignment instructions and the live-class answer pipeline.
  let text = stripModelUrls(result.text).trim();

  // P1-AC4: this module's objectives get the same "Tools You Will Use" block
  // the assignment instructions do, whenever the module's work names a tool -
  // the committed toolset is authoritative (see renderToolsYouWillUseSection's
  // own doc comment: a scan of the generated text runs ONLY as a fallback for
  // the no-committed-toolset case), resolved and rendered by the exact same
  // function so the three call sites (assignment instructions, module
  // objectives, class openers) can never drift into different tool-link
  // behavior.
  const toolsSection = renderToolsYouWillUseSection(splitToolList(requiredTools), text, "this module's hands-on work");
  if (toolsSection) {
    text = `${text}\n\n${toolsSection}`;
  }

  return { text };
}

export async function generateAssignmentInstructionsForAssignment(
  assignmentName: string,
  displayTitle: string,
  readmeContent: string,
  templateText = "",
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding",
  // AC3/AC4: the real professional tool(s) this module has committed to
  // (semicolon-joined, e.g. "Trello (free plan); Excel (free trial)"), so
  // the assignment's hands-on work is about the same tool the deck will be
  // told to use rather than drifting onto a different one. Originally this
  // carried the DECK's own choice forward (3f284a9); now that the assignment
  // generates before the deck (buildScheduleWeekPlan), the source is
  // selectRequiredTools' up-front decision instead - the parameter and its
  // meaning to this prompt are unchanged, only which caller decides the
  // value earlier. "" (the default) asks for nothing extra - every
  // pre-existing call site is unaffected.
  requiredTools = "",
  // AC1/AC2/AC3/AC7 (docs/REGRESSION.md 146): this week's course-long-project
  // milestone, when the course has one (buildScheduleWeekPlan's own
  // milestoneBriefFor lookup - null for every course with no project, and for
  // buildAssignmentPlan's repo-driven zip pipeline, which never resolves a
  // milestone at all). null (the default) changes nothing beyond this
  // parameter existing - every pre-existing call site is unaffected.
  milestone: MilestoneBrief | null = null,
  // P1-AC3: extra grounding text for the CODE-appended "Helpful Free
  // Resources" section's resolveFieldResources scan (course description,
  // typically) - "" (the default) leaves that scan working from the
  // assignment title and generated body alone, which is every pre-existing
  // call site's behavior (course-planning-grounding.ts does not pass this
  // yet, so it is unaffected).
  courseDescription = ""
): Promise<{ text: string } | { error: string }> {
  // Embedded Deterministic Engine: template the assignment instruction sheet.
  if (provider === "embedded") {
    return { text: scaffoldAssignmentDoc(displayTitle, readmeContent) };
  }

  // Tool-churn fix (docs/REGRESSION.md): requiredTools is now the COURSE's
  // committed toolset (courseProject.tools), not a fresh per-week pick - see
  // buildScheduleWeekPlan's own comment on requiredTools. COMMITTED_TOOLSET_RULE
  // is the shared "default to these; only add one with a stated reason" policy,
  // composed verbatim so this prompt, the deck's REQUIRED TOOL(S) block, and
  // generateAssignmentAction (llm-content.ts) cannot say different things
  // about when a new tool is allowed.
  const toolRequirement = requiredTools.trim()
    ? `\n11. REQUIRED TOOL(S): this course has committed to the following practitioner tool(s) for the whole term, each usable for free: ${requiredTools.trim()}. The "Instructions" section's hands-on work MUST name the specific free tier/edition/spreadsheet-equivalent to use. ${COMMITTED_TOOLSET_RULE}`
    : "";

  // AC1/AC2/AC3: the milestone sentence (renderMilestoneContract - chaining
  // to prior weeks, or the week-1/no-invented-prior-work statement) and the
  // choice-and-rigor rule (projectChoiceContract - student subject choice,
  // fixed competency) are pushed together, VERBATIM, exactly once, only when
  // this week actually has a milestone - never scattered as a second
  // paraphrase and never asserted with no project behind it.
  //
  // "Subject chosen once" fix (docs/REGRESSION.md): projectChoiceContract
  // branches on whether THIS is the first milestone (milestone.priorTitles is
  // only empty for the first milestone a project has - the exact same signal
  // renderMilestoneContract's own first-vs-later branch above already uses) -
  // a later week must not re-offer the subject choice a real generated week 8
  // did ("Select a specific infrastructure project subject...") when its own
  // milestone sentence, one paragraph earlier, already said to build on the
  // student's existing work.
  const projectRequirement = milestone
    ? `\n12. COURSE PROJECT: ${renderMilestoneContract(milestone)} ${projectChoiceContract(milestone.priorTitles.length === 0)}`
    : "";

  const prompt = `You are an expert educator writing a formal assignment instruction sheet for a ${courseKindNoun(courseKind)}.

${courseKindContract(courseKind)}

ASSIGNMENT: ${displayTitle}

README / ASSIGNMENT SOURCE:
${readmeContent}

Using the README content above, write a complete, student-facing assignment instruction document. The document should:
1. Start with the document title on the very first line, written exactly as the markdown level-1 heading "# ${displayTitle}". This must be the only level-1 heading. Never use folder names, file paths, or identifiers like "review1" or "assignment3" as the title or any heading.
2. Include an "Assignment Overview" section that clearly states the purpose and learning objectives.
3. Include a "Instructions" section that details exactly what students must do, broken into bulleted steps or tasks pulled from the README (each step on its own line starting with "- ").
4. Include a "Requirements" section listing any technical or functional requirements mentioned in the README (e.g., methods to implement, expected behaviour, constraints).
5. Do NOT include a "Helpful Free Resources" section, or any other list of external resources, tutorials, or reference material - that section is generated separately by code, from a curated, verified list, and is appended after your response. If you write your own version of it, the document ends up with the section twice. You MUST NEVER write a URL, link, or web address anywhere in this document, in any section - a URL you write yourself is never trusted and will be removed.
6. End with a "Deliverables" section that describes what must be completed and submitted (e.g., files to implement, tests to pass).
7. Format every section heading (other than the document title) as a markdown level-2 heading (e.g. "## Instructions"). For any list, start each item on its own line with a hyphen ("- "); NEVER use numbered lists (no "1.", "2.", etc.). Do not use any other markdown symbols (no bold or italics) in the body text.
8. Write in clear, direct language appropriate for undergraduate students.
9. ${PLAIN_LANGUAGE_CONTRACT}
10. ${CONCRETE_DIRECTION_CONTRACT} Apply this above all to the "Instructions" section: an open-ended step like "select a real-world project" is not actionable on its own.${toolRequirement}${projectRequirement}

Do not invent requirements not present in the README. If the README is sparse, note that students should contact the instructor (for example during office hours) for clarification. Never tell students to use, post on, check, or refer to a course discussion board, forum, or message board anywhere in the document. Do not include submission instructions - a standard submission section is appended automatically.${buildStrictTemplateBlock(templateText)}`;

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

  if (!result.text.trim()) {
    return { error: `Assignment instructions generation returned empty response for "${assignmentName}".` };
  }

  // P1-AC1/AC3: the model was told never to write a URL - stripModelUrls is
  // the last line of defense regardless, the same role it plays for the
  // live-class answer pipeline this module's design decision is modeled on.
  let text = stripModelUrls(result.text).trim();

  // P1-AC3: CODE appends the two sections a model-authored URL can never
  // reach - "Tools You Will Use" (the committed toolset - see
  // renderToolsYouWillUseSection's own doc comment for the tool-churn fix
  // that made the committed set authoritative) and "Helpful Free Resources"
  // (professional-body / open-courseware links resolved from the course
  // description, the assignment title, and the generated body) - both land
  // before the REPO_SUBMISSION_GUIDANCE this function's own callers append
  // afterward, simply by being appended here first.
  //
  // RCA regression (docs/REGRESSION.md entry 156): the prompt used to ALSO
  // ask the model to write its own "Helpful Free Resources" section (item 5
  // above), so every LLM-generated sheet ended up with the heading twice -
  // the model's own linkless list, then this code-appended, curated one.
  // Code now owns that section outright; the model is told not to write it
  // at all (see item 5 above).
  const toolsSection = renderToolsYouWillUseSection(splitToolList(requiredTools), text, "this assignment's hands-on work");
  if (toolsSection) {
    text = `${text}\n\n${toolsSection}`;
  }

  const fieldResourcesBlob = [courseDescription, displayTitle, readmeContent, text].filter(Boolean).join("\n");
  // freeResourceSourceRule's course-kind distinction (a coding course's
  // reputable sources vs an applied course's - entry off-domain-resources
  // fix, AC6) used to gate what the MODEL wrote in the section above. Now
  // that code is the ONLY author of this section, that same distinction
  // gates the CURATED resolver's own field-source choice instead (see
  // FIELD_RESOURCE_MAP's courseKind tagging in resource-links.ts).
  const resourcesSection = renderHelpfulFreeResourcesSection(fieldResourcesBlob, 3, courseKind);
  if (resourcesSection) {
    text = `${text}\n\n${resourcesSection}`;
  }

  return { text };
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
  provider: LlmProvider,
  // Bloom AC5 (progression): the total count of assignment folders in this
  // zip, so the objectives prompt can say where in the term this module
  // falls (see generateModuleObjectivesForAssignment's weekNumber/totalWeeks
  // doc comment). Both call sites (generateLecturePlansAction,
  // generateLecturePlanForAssignmentAction in lecture-plans.ts) have this
  // count in hand (bundles.length / folders.length); 0 (the default) omits
  // the term-position line rather than asserting a fabricated one.
  totalWeeks = 0
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
    // This whole function is reached only via the zip-upload flow
    // (generateLecturePlansAction / generateLecturePlanForAssignmentAction in
    // lecture-plans.ts): the deck's source is an uploaded codebase's READMEs
    // and unit tests, so it is ALWAYS a coding deck by construction, with no
    // UI concept of course kind to thread through even if one existed. Passed
    // explicitly here (rather than left to the parameter's own default) so
    // that is a stated fact about this call site, not a silent default.
    generateSlidesForAssignment(name, content, lectureDurationMinutes, provider, "coding"),
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
  const codeViolations = slidesFailed ? 0 : slidesResult.codeViolations ?? 0;

  // Derive the week number from the assignment folder name (e.g. "week3",
  // "Week 3", "assignment-03"). Fall back to the supplied position. Only used
  // for ordering now — file names use the unique label.
  const parsedWeek = name.match(/\d+/)?.[0];
  const weekNumber = parsedWeek ? parseInt(parsedWeek, 10) : index + 1;

  // Append submission guidance to instructions, guarded against double-appending
  const instructionsFailed = "error" in instructionsResult;
  const rawInstructions = instructionsFailed ? "" : instructionsResult.text;
  let finalInstructions = rawInstructions;
  if (finalInstructions.trim() && !finalInstructions.includes("Submitting your work")) {
    finalInstructions += REPO_SUBMISSION_GUIDANCE;
  }

  // AC1/AC5: objectives are generated AFTER instructions resolves (not
  // alongside slides/intro/instructions above) specifically so they can
  // ground in the REAL generated assignment text - mirroring
  // buildScheduleWeekPlan's assignment-first sequencing - rather than only
  // the README/source content every other artifact here shares. Falls back
  // to `content` (this path's own broadest source signal, same as
  // slides/intro use) when instructions failed, never a fake grounding.
  // Always "coding" (this whole function is reached only via the repo-zip
  // upload flow - see the courseKind comment on generateSlidesForAssignment
  // above), so the tool-commitment parameter is left at its default "".
  const objectivesResult = await generateModuleObjectivesForAssignment(
    name,
    displayTitle,
    rawInstructions,
    content,
    provider,
    "coding",
    "",
    weekNumber,
    totalWeeks
  );
  const objectivesFailed = "error" in objectivesResult;
  if (objectivesFailed) {
    console.error(`Module objectives generation failed for "${name}": ${objectivesResult.error}`);
  }
  const moduleObjectives = objectivesFailed
    ? scaffoldModuleObjectivesDoc(displayTitle, rawInstructions || content)
    : objectivesResult.text;

  return {
    assignmentName: name,
    slides,
    slidesFailed,
    // Always undefined in practice (this path always passes "coding" above),
    // but wired the same way buildScheduleWeekPlan is so the field means the
    // same thing everywhere a deck can be generated.
    codeStrippedFromApplied: codeViolations > 0 ? codeViolations : undefined,
    // Use the clean human title for the deck.
    presentationTitle: displayTitle,
    label,
    moduleIntroduction: "error" in introResult ? "" : introResult.text,
    assignmentInstructions: finalInstructions,
    moduleObjectives,
    objectivesFailed: objectivesFailed ? true : undefined,
    weekNumber,
    introTemplateHeadings: templates.introTemplateHeadings,
    instructionsTemplateHeadings: templates.instructionsTemplateHeadings,
  } satisfies AssignmentPlan;
}

// ── Assignment instruction sync (Canvas <-> repo) ─────────────────────────────

export const assignmentSlug = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "assignment";
