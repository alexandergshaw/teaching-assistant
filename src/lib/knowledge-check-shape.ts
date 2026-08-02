/**
 * The knowledge check's SHAPE: its question/choice types, its per-week
 * question-count bounds, and the pure predicate that decides whether a
 * generated question is usable (Y2-AC1/AC4).
 *
 * These live here, outside src/app/actions/knowledge-check.ts, for a hard
 * technical reason rather than a stylistic one: that file carries the
 * "use server" directive, and such a module may export NOTHING but async
 * functions. A plain `export const` or a synchronous `export function` in one
 * is a build error ("Only async functions are allowed to be exported in a
 * 'use server' file") - which typecheck and unit tests both pass straight
 * through, since it is neither a type error nor a runtime one. Values shared
 * between a server action and its callers therefore belong in a plain module
 * like this one.
 *
 * Pure: no I/O, no Date, no randomness.
 */

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
