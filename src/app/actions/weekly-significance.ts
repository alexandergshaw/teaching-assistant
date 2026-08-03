"use server";

// Per-week "Significance of the Material" generation: explains, in real-world
// terms, why THIS week's subject matters - built on top of the SAME anchor
// case study already assigned to this week (AssignmentPlan.caseStudy,
// actions-types.ts - the exact object buildScheduleWeekPlan/buildAssignmentPlan
// already handed to the opener/deck prompts, see case-study-prompt.ts's
// buildCaseStudyAnchorBlock/CaseStudyAssignment), never a newly invented
// example - this course deliberately anchors one verified case per week
// across every artifact so they cannot diverge.
//
// Kept in its own file rather than growing llm-content.ts or shared.ts, both
// already close to the repo's 1000-line cap - the same reasoning
// course-guides.ts's own header comment gives for generateCourseFaqAction.

import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider } from "@/lib/llm";
import { courseKindContract, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import type { CaseStudyAssignment } from "@/lib/case-study-prompt";
import { stripModelUrls } from "@/lib/urls";

/**
 * Generate a week's "Significance of the Material" document: a short piece
 * explaining why this week's subject matters in the real world, grounded in
 * and built on `caseStudy` - the SAME anchor case this week's class opener
 * and lecture deck already used - never a different or newly invented
 * example. The caller (steps.weekly-significance.ts) is responsible for
 * having a real `caseStudy` in hand before calling this at all; there is no
 * "no case available" branch here because there is nothing honest this
 * function could write without one.
 *
 * The model is told never to write a URL (the same flat prohibition every
 * other generator in this app uses - see generateAssignmentInstructionsForAssignment,
 * shared.ts); the caller still runs stripModelUrls over the returned text
 * regardless, matching that convention exactly.
 */
export async function generateWeekSignificanceAction(
  topic: string,
  summary: string,
  caseStudy: CaseStudyAssignment,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ text: string } | { error: string }> {
  try {
    const cleanTopic = topic.trim();
    if (!cleanTopic) {
      return { error: "Provide this week's topic to ground the significance document in." };
    }

    // Embedded Deterministic Engine: a short, honest paragraph built only
    // from the case study's own already-verified facts - no model call, so
    // this branch never fails and never invents anything beyond what
    // `caseStudy` itself states.
    if (provider === "embedded") {
      const periodLine = caseStudy.period ? ` (${caseStudy.period})` : "";
      const text = `# Why This Week's Material Matters\n\n${cleanTopic} is not just an academic exercise - ${caseStudy.organization}${periodLine} shows what is at stake in the real world. ${caseStudy.hook}\n\nUnderstanding this week's material is what separates someone who can only follow a checklist from someone who recognizes this same situation the next time it appears.`;
      return { text };
    }

    const periodLine = caseStudy.period
      ? `Period: ${caseStudy.period}.`
      : "Period: not established with confidence - do not state a specific year for this case anywhere in the document.";

    const prompt = `You are writing a short "Significance of the Material" document for students in a college course - a page that answers the question every student silently asks: "why does this week's subject actually matter?"

${courseKindContract(courseKind)}

${PLAIN_LANGUAGE_CONTRACT}

THIS WEEK'S TOPIC: ${cleanTopic}
${summary.trim() ? `WEEK SUMMARY: ${summary.trim()}` : ""}

THIS WEEK'S CASE STUDY (chosen once for the whole course - this is the SAME case this week's class opener and lecture deck already built around; do not invent or substitute a different one):
Organization/event: ${caseStudy.organization}.
${periodLine}
${caseStudy.hook}

Write 3-5 short paragraphs explaining, in real-world terms, why this week's subject matters - grounded in and building on the case study above (name it directly; do not just gesture at "real-world examples" in the abstract). Explain the concrete stakes: what goes wrong, or right, when this subject is handled well or badly, using the case study as the anchor example throughout. End with one or two sentences connecting this week's subject to the student's own future practice.

CRITICAL RULES:
- Build on the case study given above - never substitute a different organization or event, and never introduce a second example alongside it.
- Do not state the period above as a precise year if it was not given as one.
- You MUST NEVER write a URL, link, or web address anywhere - a URL you write yourself is never trusted and will be removed.
- Write directly to the student, in plain language. Use exactly one title line at the top (start it with "# "), then plain paragraphs - no other headings.

Return the document as plain text (the title line, then the paragraphs) - no JSON, no markdown code fencing.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: describeLlmFailure(result, "Significance-of-the-material generation failed") };
    }
    if (!result.text.trim()) {
      return { error: describeEmptyLlmText(result, "Significance-of-the-material generation failed") };
    }

    const text = stripModelUrls(result.text).trim();
    if (!text) {
      return { error: "The model returned no usable text." };
    }

    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
