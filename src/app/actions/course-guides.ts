"use server";

// FAQ generation for the course-wide guide documents produced by the
// generate-course-guides step (steps.course-guides.ts). Kept in its own file
// rather than growing llm-content.ts or shared.ts, both already close to the
// repo's 1000-line file cap.

import { callLlm, type LlmProvider } from "@/lib/llm";
import { courseKindContract, APPLIED_REAL_TOOL_RULE, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { parseLenientJsonArray } from "@/lib/lenient-json";

export interface CourseFaqPair {
  question: string;
  answer: string;
}

/**
 * Generate 8-12 FAQ question/answer pairs for a course's students, grounded
 * ONLY in the course's own facts, schedule, project (when it has one), and
 * committed toolset - the model is explicitly told never to invent a policy
 * the course has not stated (grading weights, attendance, late penalties).
 *
 * The model writes NO URLs anywhere in an answer (the same flat prohibition
 * generateAssignmentInstructionsForAssignment already uses, src/app/actions/
 * shared.ts) - the caller (generate-course-guides) runs stripModelUrls over
 * every question and answer regardless, and any link the FAQ document
 * carries comes from the curated resolvers in resource-links.ts, never from
 * the model.
 */
export async function generateCourseFaqAction(
  courseFacts: string,
  weeklyTopics: string,
  projectBrief: string,
  committedToolNames: string[],
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ pairs: CourseFaqPair[] } | { error: string }> {
  try {
    const facts = courseFacts.trim();
    if (!facts) {
      return { error: "Provide the course's facts (description, schedule) to ground the FAQ in." };
    }

    // Embedded Deterministic Engine: a fixed, always-answerable set of
    // questions grounded in whatever facts are on hand - no model call, so
    // this branch never fails and never invents an unstated policy.
    if (provider === "embedded") {
      const toolsLine =
        committedToolNames.length > 0
          ? committedToolNames.join(", ")
          : "no specific tool has been committed for this course yet";
      const pairs: CourseFaqPair[] = [
        {
          question: "What does this course cover?",
          answer: facts.split("\n")[0] || "See the syllabus for the full course description.",
        },
        {
          question: "What tools do I need for this course?",
          answer: `This course uses: ${toolsLine}. Check each tool's own free tier, trial, or community edition before paying for anything.`,
        },
        {
          question: "What is the course project?",
          answer: projectBrief.trim()
            ? projectBrief.trim().split("\n")[0]
            : "This course does not have a term-long project.",
        },
        {
          question: "How do I get help if I'm stuck?",
          answer: "Reach out to the instructor directly - contact details and office hours are on the syllabus.",
        },
        {
          question: "What should I do if I fall behind?",
          answer: "Contact the instructor as soon as possible - the syllabus explains any late-work policy.",
        },
        {
          question: "What are the academic-integrity and AI-use expectations?",
          answer: "Follow the institution's academic-integrity policy stated in the syllabus, including its expectations around AI use.",
        },
        {
          question: "Where do I find the weekly schedule?",
          answer: "See the Course Schedule document and the LMS course modules.",
        },
        {
          question: "Where do I find grading details?",
          answer: "See the syllabus, or ask the instructor directly - grading weights are not restated here.",
        },
      ];
      return { pairs };
    }

    const toolsBlock =
      committedToolNames.length > 0
        ? `THE COURSE'S COMMITTED TOOLSET: ${committedToolNames.join(", ")}. ${APPLIED_REAL_TOOL_RULE}`
        : "THE COURSE'S COMMITTED TOOLSET: none committed yet.";

    const prompt = `You are writing a Frequently Asked Questions document for students in a college course, answering the questions they actually ask before and during the term.

${courseKindContract(courseKind)}

${PLAIN_LANGUAGE_CONTRACT}

THE COURSE:
${facts}

THE WEEKLY SCHEDULE:
${weeklyTopics.trim() || "(no schedule recorded)"}

THE COURSE PROJECT:
${projectBrief.trim() || "(this course has no term-long project)"}

${toolsBlock}

Write 8 to 12 question/answer pairs covering what students actually ask: what the course covers, what the project is (when there is one), which tools are needed and whether they cost anything (grounded in the committed toolset above - never claim a paid tool is free; always point to its actual free tier, free trial, or community edition when one exists), how to get help, what to do if they fall behind, and academic-integrity / AI-use expectations stated NEUTRALLY.

CRITICAL RULES:
- Never invent a policy the course has not stated (grading weights, attendance rules, late penalties, specific integrity consequences). Where a real policy would be needed, the answer must direct the student to the syllabus or the instructor instead of making one up.
- You MUST NEVER write a URL, link, or web address anywhere in any answer - a URL you write yourself is never trusted and will be removed.
- Never mention or suggest a discussion board.
- Each answer is 2-5 sentences, in plain language, addressed to the student as "you".

Return ONLY a valid JSON array, nothing else:
[
  { "question": "...", "answer": "..." }
]`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `FAQ generation failed: HTTP ${result.status} - ${result.body.slice(0, 200)}` };
    }

    const parsed = parseLenientJsonArray(result.text);
    if (!parsed) return { error: "Could not parse the FAQ pairs from the model response." };

    const pairs: CourseFaqPair[] = parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const q = String(record.question ?? "").trim();
        const a = String(record.answer ?? "").trim();
        if (!q || !a) return null;
        return { question: q, answer: a };
      })
      .filter((p): p is CourseFaqPair => p !== null);

    if (pairs.length === 0) {
      return { error: "The model returned no usable FAQ pairs." };
    }

    return { pairs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
