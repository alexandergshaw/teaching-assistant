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
import { SIGNIFICANCE_BULLET_COUNT, buildEmbeddedSignificanceDocument } from "@/lib/significance-document";

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

    // Embedded Deterministic Engine: a short, honest document built only
    // from the case study's own already-verified facts - no model call, so
    // this branch never fails and never invents anything beyond what
    // `caseStudy` itself states. The required shape (opening paragraph,
    // exactly SIGNIFICANCE_BULLET_COUNT bullets, closing paragraph) is
    // guaranteed by buildEmbeddedSignificanceDocument's own construction
    // (significance-document.ts) rather than re-derived here - it lives in
    // that plain module, not here, because this file carries "use server"
    // and may export only async functions (see use-server-exports.test.ts).
    if (provider === "embedded") {
      const text = buildEmbeddedSignificanceDocument(cleanTopic, caseStudy);
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

Write the document in exactly this shape, and no other:
1. A SHORT OPENING PARAGRAPH (one or two sentences) that names the case study above directly (do not just gesture at "real-world examples" in the abstract) and states, in real-world terms, why this week's subject matters.
2. Exactly ${SIGNIFICANCE_BULLET_COUNT} BULLET POINTS (each starting with "- ", one line each, no sub-bullets), grounded in and building on the case study above - the concrete stakes: what specifically went wrong, or right, because of how this subject was handled. Use the case study as the anchor example throughout; do not introduce a second example alongside it.
3. A SHORT CLOSING PARAGRAPH (one or two sentences) connecting this week's subject to the student's own future practice.

CRITICAL RULES:
- The document has exactly three parts, in this order: one opening paragraph, then exactly ${SIGNIFICANCE_BULLET_COUNT} bullet points, then one closing paragraph. No other paragraphs, no extra bullets, no sub-headings anywhere.
- Build on the case study given above - never substitute a different organization or event, and never introduce a second example alongside it.
- Do not state the period above as a precise year if it was not given as one.
- You MUST NEVER write a URL, link, or web address anywhere - a URL you write yourself is never trusted and will be removed.
- Write directly to the student, in plain language. Use exactly one title line at the top (start it with "# "); the opening and closing paragraphs are plain text with no heading of their own, and the bullets are the only lines that start with "- ".

Return the document as plain text (the title line, the opening paragraph, the ${SIGNIFICANCE_BULLET_COUNT} bullet lines, then the closing paragraph) - no JSON, no markdown code fencing.`;

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
