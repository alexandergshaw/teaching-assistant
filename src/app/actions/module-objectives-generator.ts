import { courseKindContract, courseKindNoun, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { BLOOM_OBJECTIVES_CONTRACT } from "@/lib/bloom-taxonomy";
import { scaffoldModuleObjectivesDoc } from "@/lib/embedded/docs";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { stripModelUrls } from "@/lib/urls";
import { renderToolsYouWillUseSection } from "@/lib/resource-links";
import { splitToolList } from "./shared";

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
