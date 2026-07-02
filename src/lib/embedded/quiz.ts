/**
 * Deterministic quiz-question generation via cloze deletion. Where an LLM
 * composes questions, this blanks facts out of the instructor's own material:
 * the defined term is removed from a definition sentence, the number from a
 * numeric fact, or a key phrase from a topical sentence. Every answer is
 * verbatim from the source (quoted back as the question's source line), so
 * nothing is invented, and the same material always yields the same questions.
 * Multiple-choice distractors are other terms from the same material.
 */

import { extractDefinitions, keyPhrases, splitSentences } from "./scaffold";

export interface QuizQuestionScaffold {
  type: "multiple_choice" | "fill_blank";
  prompt: string;
  answer: string;
  /** Present for multiple choice: the answer plus distractors, sorted. */
  choices?: string[];
  /** The source sentence the question was generated from. */
  source: string;
}

const BLANK = "________";

/** Blank the first occurrence of `target` (case-insensitive) out of `sentence`. */
function cloze(sentence: string, target: string): string | null {
  const index = sentence.toLowerCase().indexOf(target.toLowerCase());
  if (index === -1) return null;
  return `${sentence.slice(0, index)}${BLANK}${sentence.slice(index + target.length)}`;
}

/** Distractors for a term: other candidate terms from the same material. */
function distractorsFor(answer: string, pool: string[], count = 3): string[] {
  return pool
    .filter((term) => term.toLowerCase() !== answer.toLowerCase())
    .slice(0, count);
}

/** Deterministically shuffle-free choice list: answer + distractors, sorted. */
function choiceList(answer: string, distractors: string[]): string[] {
  return [...new Set([answer, ...distractors])].sort((a, b) => a.localeCompare(b));
}

/**
 * Generate quiz questions from material. Definition sentences make the best
 * questions and come first (multiple choice when at least two other terms can
 * serve as distractors, fill-in-the-blank otherwise), then numeric facts, then
 * key-phrase clozes. Capped at `count`, in document order within each tier.
 */
export function scaffoldQuizQuestions(material: string, count = 5): QuizQuestionScaffold[] {
  const questions: QuizQuestionScaffold[] = [];
  const usedSources = new Set<string>();
  const definitions = extractDefinitions(material, 12);
  // Distractor candidates: defined terms plus the material's key phrases.
  const termPool = [
    ...new Set(
      [...definitions.map((d) => d.term), ...keyPhrases(material, 8)].filter((t) => t.length >= 3)
    ),
  ];

  // Tier 1: definitions with the defined term blanked out.
  for (const def of definitions) {
    if (questions.length >= count) break;
    const prompt = cloze(def.definition, def.term);
    if (!prompt || usedSources.has(def.definition)) continue;
    usedSources.add(def.definition);
    const distractors = distractorsFor(def.term, termPool);
    if (distractors.length >= 2) {
      questions.push({
        type: "multiple_choice",
        prompt: `Fill in the blank: ${prompt}`,
        answer: def.term,
        choices: choiceList(def.term, distractors),
        source: def.definition,
      });
    } else {
      questions.push({
        type: "fill_blank",
        prompt: `Fill in the blank: ${prompt}`,
        answer: def.term,
        source: def.definition,
      });
    }
  }

  // Tier 2: numeric facts with the number blanked out.
  for (const sentence of splitSentences(material)) {
    if (questions.length >= count) break;
    if (usedSources.has(sentence)) continue;
    const match = /\b(\d[\d,.]*)\b/.exec(sentence);
    // Skip bare tiny numbers ("2 of 3") — they make trivial questions.
    if (!match || match[1].replace(/[,.]/g, "").length < 2) continue;
    const prompt = cloze(sentence, match[1]);
    if (!prompt) continue;
    usedSources.add(sentence);
    questions.push({
      type: "fill_blank",
      prompt: `Fill in the blank: ${prompt}`,
      answer: match[1],
      source: sentence,
    });
  }

  // Tier 3: key phrases blanked out of the sentences that contain them. Short
  // sentences are skipped — blanking most of a sentence makes a junk question.
  const phrases = keyPhrases(material, 8);
  for (const phrase of phrases) {
    if (questions.length >= count) break;
    const sentence = splitSentences(material).find(
      (s) =>
        s.toLowerCase().includes(phrase.toLowerCase()) &&
        !usedSources.has(s) &&
        s.split(/\s+/).length >= 6
    );
    if (!sentence) continue;
    const prompt = cloze(sentence, phrase);
    if (!prompt) continue;
    usedSources.add(sentence);
    questions.push({
      type: "fill_blank",
      prompt: `Fill in the blank: ${prompt}`,
      answer: phrase,
      source: sentence,
    });
  }

  return questions;
}

/** Render generated questions as plain text (questions first, answer key after). */
export function renderQuizText(questions: QuizQuestionScaffold[]): string {
  if (questions.length === 0) return "";
  const lines: string[] = [];
  questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.prompt}`);
    if (q.choices) {
      q.choices.forEach((choice, c) => {
        lines.push(`   ${String.fromCharCode(97 + c)}) ${choice}`);
      });
    }
  });
  lines.push("");
  lines.push("Answer key:");
  questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.answer}`);
  });
  return lines.join("\n");
}
