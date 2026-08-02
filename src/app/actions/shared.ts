import type { SlideData, AssignmentPlan } from "../actions-types";
import { slideDeckJsonShape, slideStructureRequirements, enforceNoCodeForApplied } from "@/lib/slide-prompt";
import { coerceSlideGraphic } from "@/lib/slide-graphics";
import { courseKindContract, courseKindNoun, COMMITTED_TOOLSET_RULE, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT, CONCRETE_DIRECTION_CONTRACT } from "@/lib/artifact-voice";
import { renderMilestoneContract, projectChoiceContract, type MilestoneBrief } from "@/lib/course-project";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { scaffoldModuleIntroDoc, scaffoldAssignmentDoc, scaffoldModuleObjectivesDoc } from "@/lib/embedded/docs";
import { callLlm, type LlmProvider, type LlmPart } from "@/lib/llm";
import { humanizeAssignmentName, stripAssignmentSlugPrefix, looksLikeAssignmentSlug } from "@/lib/assignment-name";
import { stripModelUrls } from "@/lib/urls";
import { renderToolsYouWillUseSection, renderHelpfulFreeResourcesSection } from "@/lib/resource-links";
import { WORKED_EXAMPLE_CONTRACT } from "@/lib/worked-example-contract";
import { generateEmbeddedRubricText } from "@/lib/embedded-grader/rubric";
import { generateModuleObjectivesForAssignment } from "./module-objectives-generator";
import {
  buildCaseStudyAnchorBlock,
  buildOpenerContinuityBlock,
  type CaseStudyAssignment,
} from "@/lib/case-study-prompt";
import { buildConceptCycleInstruction, planWeekConcepts } from "@/lib/lecture-concepts";
import { generateWeekOpener } from "./research";
import type { AssignmentContentBundle } from "./assignment-content";

// Re-exported so every pre-existing importer of generateModuleObjectivesForAssignment
// (course-planning-grounding.ts, module-objectives.test.ts, buildAssignmentPlan
// below, and any other caller of "@/app/actions/shared" or "./shared") keeps
// working unchanged - the generator itself moved to
// ./module-objectives-generator.ts, but nothing importing it from this module
// needs to know that.
export { generateModuleObjectivesForAssignment };
export { getWritingStyleBlock } from "./writing-style-block";
export {
  ASSIGNMENTS_FOLDER_PATTERN,
  COURSE_TEXT_EXTENSIONS,
  ASSIGNMENT_MAX_FILE_CHARS,
  ASSIGNMENT_MAX_TOTAL_CHARS,
  findAssignmentsPrefix,
  listAssignmentFolders,
  extractAssignmentContentBundle,
  type AssignmentContentBundle,
} from "./assignment-content";

// requiredTools arrives as a single semicolon-joined string (e.g. "Trello
// (free plan); Excel (free trial)" - see the requiredTools parameter comment
// on generateAssignmentInstructionsForAssignment below for where that shape
// comes from). renderToolsYouWillUseSection wants the individual tool names
// as an array; this is the one place that split happens; both
// generateAssignmentInstructionsForAssignment and
// generateModuleObjectivesForAssignment (./module-objectives-generator.ts)
// reuse it so the split can never mean something slightly different in one
// call site than the other. Exported so that module can import this exact
// function rather than a re-implementation.
export function splitToolList(requiredTools: string): string[] {
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
  courseKind: CourseKind = "coding",
  // Z1 (Group Z): this week's anchor case, chosen once for the whole repo
  // zip (planCourseCaseStudies, ./case-study-plan.ts, called up front by
  // generateLecturePlansAction/generateLecturePlanForAssignmentAction in
  // lecture-plans.ts) - pins the Case Study slide to a verified entry from
  // CASE_STUDIES instead of leaving the model to pick its own per assignment
  // with no cross-week consistency guarantee. undefined for every
  // pre-existing call site.
  assignedCaseStudy?: CaseStudyAssignment,
  // Repo-driven opener-before-deck sequencing can hand the deck the week's
  // already-planned concepts instead of letting it infer them a second time.
  // Omitted/empty preserves the historical prompt exactly.
  sharedConceptPlan: string[] = [],
  // When a repo-driven caller sequenced an opener first, the deck can build
  // on that exact opener instead of repeating or drifting from it. Blank (the
  // default) preserves the historical prompt exactly.
  openerContext = ""
): Promise<{ presentationTitle: string; slides: SlideData[]; codeViolations?: number } | { error: string }> {
  // Embedded Deterministic Engine: template a deck outline from the content.
  if (provider === "embedded") {
    return scaffoldLessonPlan(content, "", {
      concepts: sharedConceptPlan,
      assignedCaseStudy,
      openerContext,
    });
  }

  const prompt = `You are an expert educator creating a lecture slide deck for a course assignment. The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

${courseKindContract(courseKind)}

ASSIGNMENT: ${assignmentName}
LECTURE DURATION: ${lectureDurationMinutes} minutes

ASSIGNMENT CONTENT:
${content}

Based on the assignment content above, create a complete lecture slide deck that teaches students the concepts they need to understand and complete this assignment. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).${buildCaseStudyAnchorBlock(assignedCaseStudy)}${buildConceptCycleInstruction(sharedConceptPlan, courseKind)}${buildOpenerContinuityBlock(openerContext)}

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
      // V3-AC3 (professional-lift audit): retry once - same as the
      // JSON-parse failures below - before falling back to the placeholder
      // deck; a single call failure in a multi-week run is almost certainly
      // transient.
      if (attempt === 1) {
        console.error(
          `Slide generation LLM call failed for "${assignmentName}" (attempt 1): HTTP ${result.status} — ${result.body.slice(0, 200)}`
        );
        continue;
      }
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

// generateModuleObjectivesForAssignment moved to
// ./module-objectives-generator.ts (imported and re-exported above) - see
// that file for its full doc comment (Bloom's Taxonomy grounding rule,
// AC1/AC5 parameter notes).

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
    ? `\n13. REQUIRED TOOL(S): this course has committed to the following practitioner tool(s) for the whole term, each usable for free: ${requiredTools.trim()}. The "Instructions" section's hands-on work MUST name the specific free tier/edition/spreadsheet-equivalent to use. ${COMMITTED_TOOLSET_RULE}`
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
    ? `\n14. COURSE PROJECT: ${renderMilestoneContract(milestone)} ${projectChoiceContract(milestone.priorTitles.length === 0)}`
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
5. Include an "Expected Scope and Effort" section (U2): state the deliverable's expected SIZE in concrete, countable terms derived from what students are actually asked to produce (a range, e.g. "12-20 tasks", "one page", "6-10 register rows" - never a boilerplate size that ignores what this specific assignment asks for), and roughly how long the work should take, as a range of hours explicitly labeled as an estimate (e.g. "about 2-3 hours (estimate)").
6. Do NOT include a "Helpful Free Resources" section, or any other list of external resources, tutorials, or reference material - that section is generated separately by code, from a curated, verified list, and is appended after your response. If you write your own version of it, the document ends up with the section twice. You MUST NEVER write a URL, link, or web address anywhere in this document, in any section - a URL you write yourself is never trusted and will be removed.
7. End with a "Deliverables" section that describes what must be completed and submitted (e.g., files to implement, tests to pass).
8. Include a "Before You Submit" section (U2): 4-6 short, checkable statements a student can verify against their own work before submitting, each tied to a specific requirement stated above (for example "Your critical path is the longest duration path, not simply the tasks you listed first") - never generic advice like "review your work carefully" that could apply to any assignment.
9. Format every section heading (other than the document title) as a markdown level-2 heading (e.g. "## Instructions"). For any list, start each item on its own line with a hyphen ("- "); NEVER use numbered lists (no "1.", "2.", etc.). Do not use any other markdown symbols (no bold or italics) in the body text.
10. Write in clear, direct language appropriate for undergraduate students.
11. ${PLAIN_LANGUAGE_CONTRACT}
12. ${CONCRETE_DIRECTION_CONTRACT} Apply this above all to the "Instructions" section: an open-ended step like "select a real-world project" is not actionable on its own. ${WORKED_EXAMPLE_CONTRACT}${toolRequirement}${projectRequirement}

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

  // U2-AC4: the per-assignment rubric is generated from the model's OWN
  // generated text (before the code-appended Tools/Resources sections below,
  // so its keyword checks are grounded in this assignment's actual
  // requirements rather than resource-link boilerplate).
  const rubricSourceText = text;

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
  // ask the model to write its own "Helpful Free Resources" section (item 6
  // above), so every LLM-generated sheet ended up with the heading twice -
  // the model's own linkless list, then this code-appended, curated one.
  // Code now owns that section outright; the model is told not to write it
  // at all (see item 6 above).
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

  // U2-AC4: a per-assignment rubric, tied to THIS assignment's own
  // deliverables - the evidence for this fix was that the only rubric in the
  // course was one generic 4-criterion document applied identically to all
  // 16 weeks, with no way for a Week 5 schedule to be graded differently from
  // a Week 13 risk register. Reuses the existing rubric machinery
  // (generateEmbeddedRubricText / buildRubricFromInstructions,
  // embedded-grader/rubric.ts - the exact engine steps.rubrics.ts's
  // "generate-rubric-offline" step already exposes) rather than inventing a
  // second rubric format: deterministic, rule-based, capped at
  // MAX_CRITERIA (4, or MAX_CRITERIA_APPLIED (5) for an applied course - Y1)
  // criteria, no extra LLM call, so this can never fail or drift
  // independently of the assignment text it is generated from. This is in
  // addition to, not a replacement for, the course-wide rubric (lms-rubric /
  // steps.rubrics.ts) - that one still covers the whole course; this one
  // covers this one assignment.
  // Y1: course-kind aware - an applied (no-code) course gets criteria built
  // from this assignment's own Requirements/Deliverables sections (a QUALITY
  // of the deliverable), never the coding grader's word/code-symbol
  // extraction that produced "Defines to (25%): Define to in your code." on
  // every one of a real course's 16 assignments. The "coding" branch below is
  // unchanged (see generateEmbeddedRubricText's own doc comment, Y1-AC5).
  const rubricText = generateEmbeddedRubricText(rubricSourceText, courseKind);
  if (rubricText.trim()) {
    text = `${text}\n\n## Grading Rubric\n${rubricText}`;
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

export interface LectureTemplates {
  introTemplateText: string;
  instructionsTemplateText: string;
  introTemplateHeadings: string[];
  instructionsTemplateHeadings: string[];
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
  totalWeeks = 0,
  // Z1 (Group Z): this assignment's anchor case, chosen once for the whole
  // zip (planCourseCaseStudies, computed up front by both lecture-plans.ts
  // call sites, keyed by the SAME normalized week number the caller later
  // renumbers plan.weekNumber to). undefined for every pre-existing caller.
  assignedCaseStudy?: CaseStudyAssignment,
  // Off by default so single-assignment regeneration and any unrelated caller
  // keep the historical repo-driven behavior exactly: no in-plan opener
  // attempt, no sequential deck gate, and openerText/openerFailed both absent.
  sequenceOpenerBeforeDeck = false
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
  const parsedWeek = name.match(/\d+/)?.[0];
  const weekNumber = parsedWeek ? parseInt(parsedWeek, 10) : index + 1;
  const assignmentGroundingSource = (cleanedReadme || content).trim() || content;

  let slidesResult: Awaited<ReturnType<typeof generateSlidesForAssignment>> | undefined;
  let introResult: Awaited<ReturnType<typeof generateModuleIntroForAssignment>> | undefined;
  let instructionsResult:
    | Awaited<ReturnType<typeof generateAssignmentInstructionsForAssignment>>
    | undefined;
  let objectivesResult: Awaited<ReturnType<typeof generateModuleObjectivesForAssignment>> | undefined;
  let openerText = "";
  let openerFailed = false;
  let sharedConceptPlan: string[] = [];

  if (sequenceOpenerBeforeDeck) {
    [instructionsResult, introResult, sharedConceptPlan] = await Promise.all([
      generateAssignmentInstructionsForAssignment(
        name,
        displayTitle,
        cleanedReadme,
        templates.instructionsTemplateText,
        provider
      ),
      generateModuleIntroForAssignment(name, displayTitle, content, templates.introTemplateText, provider),
      planWeekConcepts(displayTitle, assignmentGroundingSource, lectureDurationMinutes, provider).then(
        (plan) => plan.concepts
      ),
    ]);
  } else {
    [slidesResult, introResult, instructionsResult] = await Promise.all([
      // This whole function is reached only via the zip-upload flow
      // (generateLecturePlansAction / generateLecturePlanForAssignmentAction in
      // lecture-plans.ts): the deck's source is an uploaded codebase's READMEs
      // and unit tests, so it is ALWAYS a coding deck by construction, with no
      // UI concept of course kind to thread through even if one existed. Passed
      // explicitly here (rather than left to the parameter's own default) so
      // that is a stated fact about this call site, not a silent default.
      generateSlidesForAssignment(name, content, lectureDurationMinutes, provider, "coding", assignedCaseStudy),
      generateModuleIntroForAssignment(name, displayTitle, content, templates.introTemplateText, provider),
      generateAssignmentInstructionsForAssignment(
        name,
        displayTitle,
        cleanedReadme,
        templates.instructionsTemplateText,
        provider
      ),
    ]);
  }

  // Never drop the whole assignment when only the slide deck fails — that
  // silently removed an assignment from the output with no feedback. Keep the
  // assignment (its intro/instructions are usually fine) with an empty deck so
  // it stays visible and can be regenerated.
  const resolvedInstructions = instructionsResult;
  const instructionsFailed = !resolvedInstructions || "error" in resolvedInstructions;
  if (resolvedInstructions && "error" in resolvedInstructions) {
    console.error(`Assignment instructions failed for "${name}": ${resolvedInstructions.error}`);
  }
  const rawInstructions = instructionsFailed ? "" : resolvedInstructions.text;
  let finalInstructions = instructionsFailed
    ? scaffoldAssignmentDoc(displayTitle, assignmentGroundingSource)
    : rawInstructions;
  if (finalInstructions.trim() && !finalInstructions.includes("Submitting your work")) {
    finalInstructions += REPO_SUBMISSION_GUIDANCE;
  }

  if (sequenceOpenerBeforeDeck) {
    const openerResult = await generateWeekOpener(
      displayTitle,
      assignmentGroundingSource,
      30,
      provider,
      "coding",
      instructionsFailed ? assignmentGroundingSource : finalInstructions,
      [],
      assignedCaseStudy,
      sharedConceptPlan
    );
    if ("error" in openerResult) {
      console.error(`Class opener generation failed for "${name}": ${openerResult.error}`);
      openerFailed = true;
    } else {
      openerText = openerResult.text;
    }

    [slidesResult, objectivesResult] = await Promise.all([
      generateSlidesForAssignment(
        name,
        content,
        lectureDurationMinutes,
        provider,
        "coding",
        assignedCaseStudy,
        sharedConceptPlan,
        openerText
      ),
      generateModuleObjectivesForAssignment(
        name,
        displayTitle,
        rawInstructions,
        content,
        provider,
        "coding",
        "",
        weekNumber,
        totalWeeks
      ),
    ]);
  } else {
    objectivesResult = await generateModuleObjectivesForAssignment(
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
  }

  const resolvedSlides = slidesResult;
  if (!resolvedSlides) {
    throw new Error(`Slides were never generated for "${name}".`);
  }
  const slidesFailed = "error" in resolvedSlides;
  if (slidesFailed) {
    console.error(`Slide generation failed for "${name}": ${resolvedSlides.error}`);
  }
  const slides = slidesFailed ? [] : resolvedSlides.slides;
  const codeViolations = slidesFailed ? 0 : resolvedSlides.codeViolations ?? 0;

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
  const resolvedObjectives = objectivesResult;
  if (!resolvedObjectives) {
    throw new Error(`Module objectives were never generated for "${name}".`);
  }
  const objectivesFailed = "error" in resolvedObjectives;
  if (objectivesFailed) {
    console.error(`Module objectives generation failed for "${name}": ${resolvedObjectives.error}`);
  }
  const moduleObjectives = objectivesFailed
    ? scaffoldModuleObjectivesDoc(displayTitle, rawInstructions || content)
    : resolvedObjectives.text;

  let moduleIntroduction: string;
  let introFailed = false;
  if (!introResult || "error" in introResult) {
    introFailed = true;
    if (introResult) {
      console.error(`Module intro generation failed for "${name}": ${introResult.error}`);
    }
    moduleIntroduction = scaffoldModuleIntroDoc(displayTitle, content);
  } else {
    moduleIntroduction = introResult.text;
  }

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
    moduleIntroduction,
    introFailed: introFailed ? true : undefined,
    assignmentInstructions: finalInstructions,
    instructionsFailed: instructionsFailed ? true : undefined,
    moduleObjectives,
    objectivesFailed: objectivesFailed ? true : undefined,
    openerText: openerText || undefined,
    openerFailed: openerFailed ? true : undefined,
    weekNumber,
    introTemplateHeadings: templates.introTemplateHeadings,
    instructionsTemplateHeadings: templates.instructionsTemplateHeadings,
  } satisfies AssignmentPlan;
}

// ── Assignment instruction sync (Canvas <-> repo) ─────────────────────────────

export const assignmentSlug = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "assignment";
