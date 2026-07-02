/**
 * Extractive question answering for the Embedded Deterministic Engine. Where the
 * LLM chat composes an answer, this retrieves it: the sentences of the provided
 * text most relevant to the question are quoted back, verbatim and in order.
 * Summary and definition intents get dedicated handling. When the text does not
 * address the question, it says so honestly instead of guessing — the engine
 * never produces an answer that is not present in the source.
 */

import { extractDefinitions, pick, significantWords, splitSentences, summarize } from "./scaffold";

const SUMMARY_INTENT = /\b(?:summari[sz]e|summary|overview|tl;?dr|main (?:points|ideas)|key (?:points|takeaways)|gist)\b/i;

/** Whether a question asks for a definition (exported so callers can decide to
 *  consult the accumulated course glossary when the text has no answer). */
export const DEFINE_INTENT =
  /\b(?:define|definition of|what (?:is|are|does)|meaning of|what do(?:es)? .{1,30} mean)\b/i;

/** The honest no-answer reply (exported so callers can detect it and try other
 *  knowledge layers before giving up). */
export const NO_MATCH_REPLY =
  "The provided text doesn't appear to address that directly. Try rephrasing the question, or switch to an LLM provider for a broader answer.";

/** Sentences of `corpus` ranked by overlap with the question's significant words,
 *  weighting rarer words higher. Returns the top `max` in original order. */
function retrieveSentences(question: string, corpus: string, max: number): string[] {
  const sentences = splitSentences(corpus);
  if (sentences.length === 0) return [];

  const queryTerms = significantWords(question, 3);
  if (queryTerms.length === 0) return [];

  // Inverse sentence frequency: a term appearing in fewer sentences says more.
  const sentenceLower = sentences.map((s) => s.toLowerCase());
  const weight = new Map<string, number>();
  for (const term of queryTerms) {
    const containing = sentenceLower.filter((s) => s.includes(term)).length;
    if (containing > 0) weight.set(term, 1 + Math.log(sentences.length / containing));
  }

  const scored = sentences.map((sentence, index) => {
    const lower = sentenceLower[index];
    let score = 0;
    for (const [term, w] of weight) {
      if (lower.includes(term)) score += w;
    }
    return { sentence, index, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

/**
 * Answer a question from the given text extractively. Handles three intents:
 * summarize (extractive summary), define X (a definition sentence when the text
 * contains one), and general retrieval (the most relevant sentences, quoted).
 */
export function answerFromContext(question: string, corpus: string): string {
  const q = question.trim();
  const text = corpus.trim();
  if (!q || !text) return NO_MATCH_REPLY;

  if (SUMMARY_INTENT.test(q)) {
    const summary = summarize(text, 3);
    if (summary) {
      return `${pick(["In summary:", "The main points:", "Briefly:"], text)} ${summary}`;
    }
  }

  if (DEFINE_INTENT.test(q)) {
    const definitions = extractDefinitions(text, 12);
    const qLower = q.toLowerCase();
    const hit = definitions.find((d) => qLower.includes(d.term.toLowerCase()));
    if (hit) return hit.definition;
  }

  const relevant = retrieveSentences(q, text, 2);
  if (relevant.length === 0) return NO_MATCH_REPLY;

  const leadIn = pick(
    ["Here is what the text says about that:", "From the text:", "The relevant part of the text:"],
    q
  );
  return `${leadIn} ${relevant.join(" ")}`;
}
