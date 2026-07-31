"use server";

import { parseLenientJsonArray } from "@/lib/lenient-json";
import { scaffoldConceptAnimation } from "@/lib/embedded/animation";
import { validateAnimationHtml } from "@/lib/animation-html";
import { rememberRubric, findRubricForTopic } from "@/lib/research/rubric-bank";
import { findCaseStudyMaterial, type CaseStudyMaterial, findPracticeProblems, type PracticeProblemEntry, research, type ResearchResult } from "@/lib/research/index";
import { listUnverifiedKnowledge, verifyKnowledgeEntry, deleteKnowledgeEntry, type KnowledgeRow } from "@/lib/research/db";
import { measureCoverage, runResearchLoop, type CoverageReport, type ResearchLoopReport } from "@/lib/research/gap";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { unwrapDocumentFence } from "@/lib/llm-fence";
import type { CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT, CONCRETE_DIRECTION_CONTRACT } from "@/lib/artifact-voice";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./shared";
import { stripModelUrls } from "@/lib/urls";
import { renderToolsYouWillUseSection } from "@/lib/resource-links";


export async function findPracticeProblemsAction(
  topic: string,
  limit = 3
): Promise<{ problems: PracticeProblemEntry[] } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const problems = await findPracticeProblems(topic.trim(), limit);
    return { problems };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find practice problems." };
  }
}

export async function researchTopicAction(
  topic: string,
  limit = 5
): Promise<{ results: ResearchResult[] } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const results = await research(topic.trim(), { limit });
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not research the topic." };
  }
}

// ── Knowledge curation ───────────────────────────────────────────────────────

/** Unverified research-loop entries awaiting the owner's review, newest first. */
export async function listUnverifiedKnowledgeAction(): Promise<
  { entries: KnowledgeRow[] } | { error: string }
> {
  try {
    await requireOwner();
    const entries = await listUnverifiedKnowledge(100);
    if (entries === null) {
      return { error: "The knowledge database isn't configured. Set the Supabase env vars and apply the migrations." };
    }
    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load knowledge entries." };
  }
}

/**
 * Review one learned knowledge entry: verify (promote toward deck-grade,
 * applying the reviewer's edits) or discard it.
 */
export async function reviewKnowledgeEntryAction(
  id: string,
  decision: "verify" | "discard",
  edits?: { lesson?: string; organization?: string; year?: number }
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const ok =
      decision === "verify" ? await verifyKnowledgeEntry(id, edits ?? {}) : await deleteKnowledgeEntry(id);
    return ok ? { ok: true } : { error: "The update didn't apply. Check the knowledge database configuration." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not review the entry." };
  }
}

export async function findCaseStudyMaterialAction(
  topic: string
): Promise<{ material: CaseStudyMaterial | null } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const material = await findCaseStudyMaterial(topic.trim());
    return { material };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find a case study." };
  }
}

/**
 * Generate a class opener (case study + warm-up exercise) for a week.
 * For the embedded provider, builds deterministically from supplied materials.
 * For other providers, calls the LLM.
 */
/**
 * The opener's warm-up follows the COURSE kind - it is the same distinction,
 * so it reuses the same vocabulary rather than defining a parallel one.
 */
export type OpenerExerciseKind = CourseKind;

export async function generateClassOpenerAction(
  topic: string,
  summary: string,
  minutes: number,
  caseStudyMaterial: CaseStudyMaterial | null,
  practiceProblems: PracticeProblemEntry[],
  provider: LlmProvider = "gemini",
  exerciseKind: OpenerExerciseKind = "coding",
  // AC1/AC2: this week's already-generated assignment text, when the caller
  // has one and chooses to ground the opener in it (steps.content-lectures.ts'
  // generate-class-openers, opt-in only - see its groundInAssignment input).
  // "" (the default) leaves the prompt exactly as it was before this
  // parameter existed, so every pre-existing caller (including the opener
  // generateAssignmentAction's own template step calls internally) is
  // unaffected.
  assignmentContext = ""
): Promise<{ title: string; text: string } | { error: string }> {
  try {
    await requireOwner();

    const minutesNum = Math.max(5, Math.min(minutes, 120));
    const isCoding = exerciseKind === "coding";
    const warmupHeading = isCoding ? "Warm-up coding exercise" : "Warm-up exercise";
    const caseStudyMinutes = Math.round((minutesNum * 0.6) / 5) * 5;
    const warmupMinutes = Math.round((minutesNum * 0.35) / 5) * 5;
    const debriefMinutes = Math.max(5, minutesNum - caseStudyMinutes - warmupMinutes);

    if (provider === "embedded") {
      const title = `Class Opener: ${topic}`;
      const sections: string[] = [
        `# ${title}`,
        "",
        `## Case study discussion (about ${caseStudyMinutes} minutes)`,
      ];

      if (caseStudyMaterial) {
        sections.push(caseStudyMaterial.title);
        sections.push("");
        for (const bullet of caseStudyMaterial.bullets) {
          sections.push(`- ${bullet}`);
        }
        sections.push("");
      } else {
        sections.push(
          `Case Study: ${topic}`,
          "",
          `This case study explores a real-world application of ${topic}. Consider how the principles of ${topic} applied in practice, and what lessons apply to your learning.`,
          ""
        );
      }

      sections.push(
        "Discussion Questions:",
        `1. What key principles of ${topic} were at play in this scenario?`,
        "2. How might this situation have been different with better planning or execution?",
        "3. What would you do differently?",
        "",
        `## ${warmupHeading} (about ${warmupMinutes} minutes)`,
        ""
      );

      if (isCoding && practiceProblems.length > 0) {
        const problem = practiceProblems[0];
        sections.push(
          problem.title,
          "",
          problem.prompt,
          ""
        );
        if (problem.exampleCode) {
          sections.push(
            "Example (reference, not the solution):",
            "```",
            problem.exampleCode,
            "```",
            ""
          );
        }
      } else {
        sections.push(
          isCoding
            ? "Write a short program or function that demonstrates the key concepts of this week."
            : `Work through a short, concrete exercise that applies ${topic} to a realistic situation.`,
          isCoding ? "- Start with a clear problem statement" : "- Start from a realistic scenario",
          isCoding ? "- Write pseudocode first" : "- Decide what a good outcome looks like",
          isCoding ? "- Implement in your chosen language" : "- Produce a short written artifact (a list, a table, or a one-page plan)",
          ""
        );
      }

      sections.push(
        `## Debrief (about ${debriefMinutes} minutes)`,
        ""
      );

      if (isCoding && practiceProblems.length > 0 && practiceProblems[0].solutionCode) {
        sections.push(
          "Solution and key takeaways:",
          "",
          "```",
          practiceProblems[0].solutionCode,
          "```",
          "",
          `Key concepts: The exercise reinforces ${topic} through hands-on practice.`,
          ""
        );
      } else {
        sections.push(
          `Key concepts: Focus on how ${topic} connects theory to real practice.`,
          ""
        );
      }

      return {
        title,
        text: sections.join("\n"),
      };
    }

    const user = await requireOwner();
    const styleBlock = await getWritingStyleBlock(user.id);

    const caseStudyContext = caseStudyMaterial
      ? `Case Study Material:\nTitle: ${caseStudyMaterial.title}\n${caseStudyMaterial.bullets.map((b) => `- ${b}`).join("\n")}`
      : `Topic: ${topic}

No case study material was supplied. Choose a specific, well-known, widely-documented real event from THIS COURSE'S OWN FIELD: name the organization involved and roughly when it happened. Stick to established facts and never invent an event, a date, or a name.`;

    // AC3 guard: practiceProblems is bank-sourced and the bank is a SOFTWARE
    // bank (every entry can carry exampleCode/solutionCode - see
    // PracticeProblemEntry) - both current callers already skip fetching it
    // for an applied warm-up, but this function must not trust that and
    // inject a coding practice problem into an applied prompt just because
    // one somehow reached it (a future caller forgetting that skip, or a
    // caller passing a stale array). Only a coding opener ever uses it.
    const practiceContext =
      isCoding && practiceProblems.length > 0
        ? `Practice Problem:\n${practiceProblems[0].title}\n${practiceProblems[0].prompt}`
        : `Topic: ${topic}`;

    // AC1/AC2: the opener exists to warm students up for the week's
    // assignment, so when the caller has already generated it (see the new
    // trailing parameter's doc comment above), the opener is told to prepare
    // students for that concrete deliverable rather than only the topic line.
    const assignmentGroundingBlock = assignmentContext.trim()
      ? `\n\nTHIS WEEK'S ASSIGNMENT (already written - the warm-up exercise should prepare students to succeed at it):\n${assignmentContext.trim()}`
      : "";

    const llmPrompt = `You are an expert educator creating a class opener (30 minutes max, usually less) combining a case study discussion and a ${isCoding ? "warm-up coding exercise" : "practical warm-up exercise"}.

TOPIC: ${topic}
SUMMARY: ${summary}
TARGET DURATION: ${minutesNum} minutes (split roughly: ${caseStudyMinutes} case study, ${warmupMinutes} warm-up exercise, ${debriefMinutes} debrief)

${caseStudyContext}

${practiceContext}${assignmentGroundingBlock}

Write the opener as clean plain text using lightweight markdown:
- The first line is the title: "# Class Opener: [Topic]"
- Use "## Section Name" headings for the three sections: "Case study discussion", "${warmupHeading}", "Debrief"
- Include timing hints in the headings like "(about 15 minutes)"
- Use "- " for bullet points and discussion questions
- For code, use triple backticks with a language identifier

Structure:
1. Case study discussion section: briefly ground in the real event/context, explain why it matters for this topic, and include 2-3 discussion questions
2. ${warmupHeading}: ${isCoding ? "provide a clear task statement, starter code ideas, and hints for an introductory difficulty problem" : "provide a clear task statement and a worked-through structure for a short, hands-on exercise that produces a written artifact. This is NOT a programming course: do not ask students to write, run, or read code, and do not include code blocks"}
3. Debrief: provide the exercise solution (if applicable) and key takeaways for the instructor

Requirements:
- Return ONLY the document text. No code fences around the whole output, no commentary, no HTML.
- Be clear, engaging, and professional.
- ${PLAIN_LANGUAGE_CONTRACT}
- ${CONCRETE_DIRECTION_CONTRACT} Apply this to the ${warmupHeading.toLowerCase()} in particular: a warm-up that only names a format (a grid, a list, a plan) without a worked example leaves the student guessing what "done" looks like.
- Do not invent specific facts, dates, or names beyond the case study you were told to choose above; everything else must come from the provided materials.
- Make the exercises doable in the target duration.${styleBlock}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    // Only a fence wrapping the WHOLE response is stripped. The old
    // unanchored regex matched the ```python block inside a warm-up exercise
    // and returned just the code, discarding the entire opener.
    const text = unwrapDocumentFence(result.text);
    if (!text) {
      return { error: "The model returned an empty opener." };
    }

    const titleMatch = text.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `Class Opener: ${topic}`;

    return { title, text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the class opener." };
  }
}

/**
 * Generate one week's class-opener DOCUMENT TEXT, ready to ship as a docx:
 * the case-study/practice-problem lookup, the generateClassOpenerAction call,
 * then the same last-line-of-defense URL strip and "Tools You Will Use"
 * section every existing opener document already carries. Extracted so BOTH
 * callers - the standalone generate-class-openers step
 * (steps.content-lectures.ts) and buildScheduleWeekPlan's in-plan opener
 * phase (course-planning-grounding.ts, gated by its own
 * sequenceOpenerBeforeDeck parameter) - call this SAME function instead of
 * each carrying its own copy of the wrapping logic, exactly as
 * generate-weekly-announcements reuses draftAnnouncementAction rather than
 * re-deriving its own announcement text.
 *
 * Behavior is byte-for-byte what the standalone step already did inline
 * (this is a pure extraction, not a rewrite): the curated case-study bank and
 * the practice-problem bank are both SOFTWARE banks, so both lookups are
 * skipped entirely for an applied (no-code) exerciseKind.
 */
export async function generateWeekOpener(
  topic: string,
  summary: string,
  minutes: number,
  provider: LlmProvider = "gemini",
  exerciseKind: OpenerExerciseKind = "coding",
  // AC1/AC2 (generateClassOpenerAction's own parameter): this week's
  // already-generated assignment text, when the caller has one - "" (the
  // default) leaves the prompt exactly as generateClassOpenerAction always
  // has it.
  assignmentContext = "",
  // The course's committed toolset (courseProject.tools) - [] renders no
  // "Tools You Will Use" section, same as before this parameter existed.
  committedToolNames: string[] = []
): Promise<{ text: string } | { error: string }> {
  const caseStudyResult = exerciseKind === "coding" ? await findCaseStudyMaterialAction(topic) : null;
  const caseStudyMaterial = caseStudyResult && "material" in caseStudyResult ? caseStudyResult.material : null;

  const practiceProblems =
    exerciseKind === "coding"
      ? await findPracticeProblemsAction(topic, 2).then((r) => ("problems" in r ? r.problems : []))
      : [];

  const openerResult = await generateClassOpenerAction(
    topic,
    summary,
    minutes,
    caseStudyMaterial,
    practiceProblems,
    provider,
    exerciseKind,
    assignmentContext
  );
  if ("error" in openerResult) return { error: openerResult.error };

  let openerText = stripModelUrls(openerResult.text).trim();
  const toolsSection = renderToolsYouWillUseSection(committedToolNames, openerText, "this week's warm-up exercise");
  if (toolsSection) {
    openerText = `${openerText}\n\n${toolsSection}`;
  }

  return { text: openerText };
}

export async function rememberRubricAction(
  rubric: string,
  topic: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!rubric.trim() || !topic.trim()) return { error: "Provide a rubric and a topic." };
    void rememberRubric(topic, rubric);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not bank the rubric." };
  }
}

export async function findBankedRubricAction(
  topic: string
): Promise<{ rubric: string; matched: boolean } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const found = await findRubricForTopic(topic);
    return { rubric: found ?? "", matched: found != null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not look up a banked rubric." };
  }
}

export async function measureKnowledgeGapAction(
  topic: string
): Promise<{ report: CoverageReport } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const report = await measureCoverage(topic.trim());
    return { report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not measure coverage." };
  }
}

export async function runResearchLoopAction(
  topic: string
): Promise<{ report: ResearchLoopReport } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const before = await measureCoverage(topic.trim());
    const report = await runResearchLoop(topic.trim(), before);
    return { report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not run the research loop." };
  }
}

/** Count of the owner's PENDING grading drafts created since the given ISO
 * timestamp - powers the Grade Drafts nav-tab badge. Defensive: any failure
 * returns 0 so the badge never breaks the nav. */

/**
 * Generate a plan of visualizable concepts from a course topic and summary.
 * Provider "embedded" uses a deterministic fallback (split summary into sentences).
 * Otherwise calls the LLM to extract the count most visualizable concepts with
 * animation ideas. Falls back to embedded derivation if LLM returns empty/malformed
 * JSON, never failing due to LLM quality issues.
 */
export async function generateConceptPlanAction(
  topic: string,
  summary: string,
  count: number,
  provider: LlmProvider = "gemini"
): Promise<{ concepts: Array<{ concept: string; visualIdea: string }> } | { error: string }> {
  try {
    await requireOwner();
    const clampedCount = Math.max(1, Math.min(6, count));

    // Embedded Deterministic Engine: split summary into sentences and derive
    // concepts from them (no model call).
    if (provider === "embedded") {
      return { concepts: deriveConceptsFromSummary(topic, summary, clampedCount) };
    }

    const prompt = `You are an educational designer planning animated concept visualizations for a course week.

TOPIC: ${topic.trim()}

SUMMARY:
${summary.trim()}

Extract the ${clampedCount} most visualizable concepts from this week's material. A visualizable concept is one where animation (state changes, flows, comparisons, transformations) shows the idea better than static text alone.

Return ONLY valid JSON (no markdown, no code fence, no extra text):
[
  { "concept": "...", "visualIdea": "..." },
  ...
]

Each object must have:
- "concept": a concise, specific concept name (2-5 words)
- "visualIdea": one concrete animation idea (what visual change/flow/comparison depicts it)

Return exactly ${clampedCount} entries or fewer if fewer exist.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { concepts: deriveConceptsFromSummary(topic, summary, clampedCount) };
    }

    const jsonText = result.text.trim();
    const parsed = parseLenientJsonArray(jsonText);

    if (!parsed || parsed.length === 0) {
      return { concepts: deriveConceptsFromSummary(topic, summary, clampedCount) };
    }

    const concepts = parsed
      .slice(0, clampedCount)
      .filter(
        (item): item is { concept: string; visualIdea: string } =>
          typeof item === "object" &&
          item !== null &&
          "concept" in item &&
          "visualIdea" in item &&
          typeof (item as Record<string, unknown>).concept === "string" &&
          typeof (item as Record<string, unknown>).visualIdea === "string"
      )
      .map((item) => ({
        concept: (item.concept as string).trim(),
        visualIdea: (item.visualIdea as string).trim(),
      }))
      .filter((item) => item.concept && item.visualIdea);

    if (concepts.length === 0) {
      return { concepts: deriveConceptsFromSummary(topic, summary, clampedCount) };
    }

    return { concepts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate a professional self-contained HTML animation for a single concept.
 * Provider "embedded" returns scaffoldConceptAnimation directly.
 * Otherwise calls the LLM with a strict prompt, validates the result, and retries
 * once with problems appended if validation fails. Falls back to scaffoldConceptAnimation
 * on persistent validation failures, never failing due to LLM output quality.
 */
export async function generateConceptAnimationAction(
  concept: string,
  visualIdea: string,
  context: string,
  provider: LlmProvider = "gemini"
): Promise<{ html: string } | { error: string }> {
  try {
    await requireOwner();

    // Embedded Deterministic Engine: return the fallback animation.
    if (provider === "embedded") {
      return { html: scaffoldConceptAnimation(concept, visualIdea) };
    }

    const basePrompt = `You are an expert in educational animation and data visualization. Create a self-contained HTML fragment (NO doctype, html, head, or body tags) that teaches the following concept visually.

CONCEPT: ${concept}
ANIMATION IDEA: ${visualIdea}
CONTEXT: ${context}

Requirements:
- Produce ONE HTML fragment only (no wrapper tags).
- Use SVG with CSS @keyframes and/or SMIL <animate> elements to create a 12-25 second staged loop.
- The loop should be: Setup (introduce the concept) -> Transformation (show the key change/flow/comparison) -> Result (show the outcome).
- Include on-canvas captions for each stage (text labels within the SVG or adjacent text).
- Include a plain-text legend below the animation explaining the stages.
- Use a muted professional palette (grays with one accent color, e.g., #0066cc).
- Ensure accessible contrast (text on backgrounds must meet WCAG AA).
- NO JavaScript whatsoever.
- NO external images, fonts, or links (data: URIs and internal #ids are fine).
- NO emojis.
- Self-contained: all styles inline or in <style>, all content inline.

Output ONLY the HTML fragment itself.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: basePrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { html: scaffoldConceptAnimation(concept, visualIdea) };
    }

    let html = stripCodeFences(result.text);
    let validation = validateAnimationHtml(html);

    if (!validation.ok) {
      const correctionPrompt = basePrompt + `

Your previous attempt violated these requirements:
${validation.problems.map((p) => "- " + p).join("\n")}

Fix these issues and try again.`;

      const retryResult = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: correctionPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        },
        provider
      );

      if (retryResult.ok) {
        html = stripCodeFences(retryResult.text);
        validation = validateAnimationHtml(html);
      }
    }

    if (!validation.ok) {
      return { html: scaffoldConceptAnimation(concept, visualIdea) };
    }

    return { html };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Deterministically derive up to count concepts from a summary by splitting
 * into sentences. Returns { concept: first 6 words titled, visualIdea: the sentence }.
 */
function deriveConceptsFromSummary(
  topic: string,
  summary: string,
  count: number
): Array<{ concept: string; visualIdea: string }> {
  const sentences = summary
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences.slice(0, count).map((sentence) => {
    const words = sentence.split(/\s+/).slice(0, 6);
    const concept = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return {
      concept: concept || topic,
      visualIdea: sentence,
    };
  });
}

// The Concept Visualizer actions (findVisualizerConceptAction,
// createVisualizerConceptAction, extractDeckConceptsAction) live in
// ./visualizer.ts - moved out to keep this file under the line cap, and
// re-exported from actions.ts alongside everything else here.

/**
 * List all open problems for the user.
 */
export async function listOpenProblemsAction(): Promise<
  { problems: Array<{ id: string; title: string; detail: string }>; count: number } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { listProblems } = await import("@/lib/problems");
    const allProblems = await listProblems(supabase, user.id);
    const openProblems = allProblems.filter((p) => p.status === "open");
    return {
      problems: openProblems.map((p) => ({
        id: p.id,
        title: p.title,
        detail: p.detail,
      })),
      count: openProblems.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list open problems." };
  }
}

/**
 * List all solutions for a specific problem.
 */
async function listProblemSolutionsAction(
  problemId: string
): Promise<{ solutions: Array<{ title: string; approach: string }> } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { listSolutionsForProblem } = await import("@/lib/problems");
    const solutions = await listSolutionsForProblem(supabase, user.id, problemId);
    return {
      solutions: solutions.map((s) => ({
        title: s.title,
        approach: s.approach,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list solutions." };
  }
}

/**
 * Process all open problems: generate and save solutions for each one.
 */
export async function processProblemSolutionsAction(
  problemsJson: string,
  provider: LlmProvider
): Promise<
  {
    report: string;
    proposedCount: number;
  } | { error: string }
> {
  try {
    await requireOwner();

    let problems: Array<{ id: string; title: string; detail: string }>;
    try {
      problems = JSON.parse(problemsJson);
    } catch {
      return { error: "Problems JSON is invalid." };
    }

    if (!Array.isArray(problems)) {
      return { error: "Problems must be a JSON array." };
    }

    const reportLines: string[] = [];
    let proposedCount = 0;

    for (const problem of problems) {
      try {
        const priorResult = await listProblemSolutionsAction(problem.id);
        const priorSolutions = "error" in priorResult ? [] : priorResult.solutions;

        const result = await proposeProblemSolutionsAction(problem, priorSolutions, provider);

        if ("error" in result) {
          reportLines.push(`${problem.title}: ${result.error}`);
          continue;
        }

        proposedCount += result.solutions.length;
        reportLines.push(`${problem.title}: Proposed ${result.solutions.length} solution(s).`);

        for (const sol of result.solutions) {
          reportLines.push(`  - ${sol.title}`);
          reportLines.push(`    ${sol.approach}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        reportLines.push(`${problem.title}: Failed - ${message}`);
      }
    }

    return {
      report: reportLines.join("\n"),
      proposedCount,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Propose 2-3 NEW solutions to an open problem, ensuring they differ from all
 * prior solutions. Inserts solutions via insertSolutions with the service client.
 * Returns solutions or error.
 */
async function proposeProblemSolutionsAction(
  problem: { id: string; title: string; detail: string },
  priorSolutions: Array<{ title: string; approach: string }>,
  provider: LlmProvider
): Promise<{ solutions: Array<{ title: string; approach: string }> } | { error: string }> {
  try {
    const user = await requireOwner();

    if (provider === "embedded") {
      return { error: "Proposing solutions requires an LLM provider." };
    }

    const priorList = priorSolutions.length > 0
      ? priorSolutions.map(s => `${s.title}\n${s.approach}`).join("\n---\n")
      : "(none)";

    const prompt = `You are helping solve a user's problem. The problem is:

PROBLEM TITLE: ${problem.title}
PROBLEM DETAIL: ${problem.detail || "(no additional detail)"}

The user has already received these solution proposals (by title and approach):
${priorList}

Now propose 2-3 BRAND NEW solutions that are materially different from every prior solution. Each solution must use a different mechanism or angle, not a rewording of existing proposals.

Return ONLY a valid JSON array:
[
  {"title": "Solution Name", "approach": "3-6 sentences describing the concrete, actionable approach."},
  {"title": "Another Solution", "approach": "..."}
]

Ensure each approach is 3-6 sentences, concrete, and actionable.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      },
      provider
    );

    if (!result.ok) {
      return { error: "Failed to generate solutions." };
    }

    let solutions = parseLenientJsonArray(result.text) as
      | Array<{ title?: string; approach?: string }>
      | null;
    if (!solutions || solutions.length < 2 || solutions.length > 3) {
      solutions = null;
    }

    if (!solutions) {
      const retryPrompt = `${prompt}

Remember: Return ONLY the JSON array with 2-3 solutions, nothing else. Each must be different from every prior solution.`;
      const retryResult = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: retryPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        },
        provider
      );

      if (!retryResult.ok) {
        return { error: "Failed to generate solutions on retry." };
      }

      solutions = parseLenientJsonArray(retryResult.text) as
        | Array<{ title?: string; approach?: string }>
        | null;
    }

    if (!solutions || solutions.length < 2 || solutions.length > 3) {
      return { error: "Could not generate valid 2-3 solutions." };
    }

    const validated: Array<{ title: string; approach: string }> = [];
    for (const sol of solutions) {
      const title = typeof sol.title === "string" ? sol.title.trim() : "";
      const approach = typeof sol.approach === "string" ? sol.approach.trim() : "";
      if (title && approach) {
        validated.push({ title, approach });
      }
    }

    if (validated.length < 2) {
      return { error: "Generated solutions had empty fields." };
    }

    const supabase = createServiceClient();
    const { insertSolutions } = await import("@/lib/problems");
    await insertSolutions(supabase, user.id, problem.id, validated);

    return { solutions: validated };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Strip markdown code fences from text (```...``` or ```language...```).
 */
function stripCodeFences(text: string): string {
  return text.replace(/```[a-z]*\n?/gi, "").trim();
}
