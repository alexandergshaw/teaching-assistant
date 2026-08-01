"use server";

// Per-week knowledge check generation (Y2): a short, auto-gradable
// multiple-choice check for each week's material, grounded ONLY in that
// week's OWN generated materials (gatherWeekMaterials, steps.weekly-
// announcements.ts) rather than generic recall of terminology. Every wrong
// answer carries a one-sentence explanation of the SPECIFIC misconception it
// represents - that is what makes this a teaching tool rather than only a
// test (Y2-AC1/AC4).
//
// Kept in its own file rather than growing llm-content.ts or shared.ts, both
// already close to the repo's 1000-line cap - the same reasoning
// course-guides.ts's own header comment gives for generateCourseFaqAction.

import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider } from "@/lib/llm";
import { courseKindContract, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { extractJsonObject } from "./shared";
import { scaffoldQuizQuestions } from "@/lib/embedded/quiz";

export interface KnowledgeCheckChoice {
  text: string;
  correct: boolean;
  /** A one-sentence explanation of the specific misconception this choice
   * represents. Always "" for the correct choice - only a WRONG choice needs
   * explaining (Y2-AC1/AC4). */
  explanation: string;
}

export interface KnowledgeCheckQuestion {
  prompt: string;
  /** Always exactly 4 after validation: one correct answer, three distractors. */
  choices: KnowledgeCheckChoice[];
}

/** Y2-AC1: "5-8 questions per week". */
export const MIN_KNOWLEDGE_CHECK_QUESTIONS = 5;
export const MAX_KNOWLEDGE_CHECK_QUESTIONS = 8;

// A wrong-choice explanation shorter than this is treated as a placeholder,
// not a real misconception explanation (Y2-AC1's "one-sentence explanation"
// and Y2-AC4's "diagnostic distractor" are both unmet by a blank or
// near-blank string).
const MIN_EXPLANATION_LENGTH = 8;

/**
 * Whether a single question is genuinely usable: exactly 4 distinct,
 * non-empty choices, exactly one marked correct, and every WRONG choice
 * carries a real explanation. A question missing any of this is rejected
 * outright (never patched or padded) - Y2-AC1 ("each with ... a one-sentence
 * explanation of why each distractor is wrong") and Y2-AC4 ("distractors
 * must be plausible and diagnostic") are both unmet otherwise. Exported so
 * the caller (steps.knowledge-checks.ts) can re-apply the SAME check after
 * stripModelUrls, since stripping a model-authored URL out of a field can
 * leave it empty.
 */
export function isUsableKnowledgeCheckQuestion(q: {
  prompt: string;
  choices: Array<{ text: string; correct: boolean; explanation: string }>;
}): boolean {
  if (!q.prompt.trim()) return false;
  if (q.choices.length !== 4) return false;
  if (q.choices.some((c) => !c.text.trim())) return false;

  // Choice text must be distinct - a repeated option is never a real
  // distractor and makes the question degenerate.
  const uniqueTexts = new Set(q.choices.map((c) => c.text.trim().toLowerCase()));
  if (uniqueTexts.size !== q.choices.length) return false;

  const correctCount = q.choices.filter((c) => c.correct).length;
  if (correctCount !== 1) return false;

  return q.choices.every((c) => c.correct || c.explanation.trim().length >= MIN_EXPLANATION_LENGTH);
}

/** Parses and validates the model's raw `questions` array into usable
 * KnowledgeCheckQuestion objects, dropping (never patching) anything
 * malformed: duplicate prompts, the wrong choice count, more or less than
 * one correct answer, or a distractor with no real explanation. Capped at
 * MAX_KNOWLEDGE_CHECK_QUESTIONS even when the model returns more. */
function sanitizeQuestions(raw: unknown): KnowledgeCheckQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seenPrompts = new Set<string>();
  const questions: KnowledgeCheckQuestion[] = [];

  for (const entry of raw) {
    if (questions.length >= MAX_KNOWLEDGE_CHECK_QUESTIONS) break;
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const prompt = String(record.prompt ?? "").trim();
    if (!prompt || seenPrompts.has(prompt.toLowerCase())) continue;

    const rawChoices = Array.isArray(record.choices) ? record.choices : [];
    const choices: KnowledgeCheckChoice[] = rawChoices.map((c) => {
      if (!c || typeof c !== "object") return { text: "", correct: false, explanation: "" };
      const cRecord = c as Record<string, unknown>;
      const correct = cRecord.correct === true;
      return {
        text: String(cRecord.text ?? "").trim(),
        correct,
        explanation: correct ? "" : String(cRecord.explanation ?? "").trim(),
      };
    });

    const candidate: KnowledgeCheckQuestion = { prompt, choices };
    if (!isUsableKnowledgeCheckQuestion(candidate)) continue;

    seenPrompts.add(prompt.toLowerCase());
    questions.push(candidate);
  }

  return questions;
}

/**
 * Generate a week's knowledge check: 5-8 Apply/Analyze multiple-choice
 * questions grounded ONLY in the supplied materials (that week's REAL
 * generated objectives/opener/assignment text), each with exactly one
 * correct answer and three distractors - every distractor carrying a
 * one-sentence explanation of the specific misconception it represents
 * (Y2-AC1/AC2/AC4).
 *
 * The model is told never to write a URL (Y2's "no model-authored URLs"
 * convention); the caller (steps.knowledge-checks.ts) still runs
 * stripModelUrls over every returned string regardless, the same belt-and-
 * braces convention generateCourseFaqAction documents (course-guides.ts).
 */
export async function generateKnowledgeCheckAction(
  weekLabel: string,
  topic: string,
  materials: string,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ questions: KnowledgeCheckQuestion[] } | { error: string }> {
  try {
    const groundingText = materials.trim();
    if (!groundingText) {
      return { error: "Provide this week's generated materials to ground the knowledge check in." };
    }

    // Embedded Deterministic Engine: cloze multiple-choice questions from the
    // material with no model call. Lower fidelity than the LLM path (a
    // generic, honest explanation rather than a diagnosed misconception) but
    // never fails and never invents a fact absent from the material.
    if (provider === "embedded") {
      const scaffolded = scaffoldQuizQuestions(groundingText, MAX_KNOWLEDGE_CHECK_QUESTIONS * 2).filter(
        (q) => q.type === "multiple_choice" && Array.isArray(q.choices) && q.choices.length === 4
      );

      const questions: KnowledgeCheckQuestion[] = [];
      for (const q of scaffolded) {
        if (questions.length >= MAX_KNOWLEDGE_CHECK_QUESTIONS) break;
        const candidate: KnowledgeCheckQuestion = {
          prompt: q.prompt,
          choices: (q.choices ?? []).map((text) => ({
            text,
            correct: text === q.answer,
            explanation:
              text === q.answer
                ? ""
                : "This choice comes from a different part of this week's material and does not match what the question asks for.",
          })),
        };
        if (isUsableKnowledgeCheckQuestion(candidate)) questions.push(candidate);
      }
      return { questions };
    }

    const prompt = `You are an expert educator writing a short knowledge check for a college course - a formative, auto-gradable quiz students take BETWEEN reading this week's material and being graded on it, in the style of Coursera or the Google Career Certificates.

${courseKindContract(courseKind)}

${PLAIN_LANGUAGE_CONTRACT}

${weekLabel}${topic ? `: ${topic}` : ""}

THIS WEEK'S ACTUAL MATERIAL (ground every question in this - do not test generic recall it does not need):
${groundingText}

Write between ${MIN_KNOWLEDGE_CHECK_QUESTIONS} and ${MAX_KNOWLEDGE_CHECK_QUESTIONS} multiple-choice questions that test whether a student can APPLY or ANALYZE this week's material, never bare recall. Prefer a question that reuses this week's own worked example, table, scenario, or artifact and asks the student to apply the same reasoning to a new but structurally identical situation, or to analyze the given worked example itself - "Which task is on the critical path in this table?" tests the actual skill; "What does CPM stand for?" only tests memorization and must be avoided.

Each question has EXACTLY 4 answer choices: one correct answer and three distractors. Every distractor must be PLAUSIBLE and DIAGNOSTIC - the answer a student holding one SPECIFIC, real misconception would actually pick (for a critical-path question, a plausible distractor is "the single longest task" - the misconception of picking the longest task instead of the longest path). An implausible or silly distractor a student could dismiss without understanding the material teaches nothing and makes the question trivially guessable - never write one.

For every distractor (never the correct answer), write ONE sentence naming the SPECIFIC misconception that choice represents, directly and plainly - this explanation is what makes this a teaching tool rather than only a test.

Return ONLY valid JSON:
{
  "questions": [
    {
      "prompt": "...",
      "choices": [
        { "text": "...", "correct": true },
        { "text": "...", "correct": false, "explanation": "..." },
        { "text": "...", "correct": false, "explanation": "..." },
        { "text": "...", "correct": false, "explanation": "..." }
      ]
    }
  ]
}

Requirements:
- Exactly one choice per question has "correct": true; the other three have "correct": false and a non-empty one-sentence "explanation".
- Never write an "explanation" for the correct choice.
- Never invent a fact that is not supported by the material above.
- You MUST NEVER write a URL, link, or web address anywhere in a prompt, choice, or explanation - a URL you write yourself is never trusted and will be removed.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: describeLlmFailure(result, "Knowledge check generation failed") };
    }
    if (!result.text.trim()) {
      return { error: describeEmptyLlmText(result, "Knowledge check generation failed") };
    }

    const parsed = extractJsonObject(result.text);
    if (!parsed) {
      return { error: "Could not parse the knowledge check from the model response." };
    }

    const questions = sanitizeQuestions(parsed.questions);
    if (questions.length === 0) {
      return { error: "The model returned no usable knowledge check questions." };
    }

    return { questions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
