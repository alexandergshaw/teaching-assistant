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

/** One prior turn of a conversation (any assistant/model role naming works). */
export interface ChatTurn {
  role: string;
  text: string;
}

// Signals that a question leans on earlier turns: a continuation lead-in, a
// pronoun standing in for something named before, or too few content words to
// retrieve with on its own.
const FOLLOW_UP_CUE =
  /^(?:and|also|what about|how about|ok(?:ay)?|so|then)\b|\b(?:it|its|that|this|these|those|they|them|their|the (?:first|second|third|last) one)\b/i;

/**
 * Resolve a terse follow-up against the conversation: when the question leans
 * on earlier turns, append the most recent user turns' significant terms so
 * retrieval sees the full subject ("when is it due?" after a midterm question
 * retrieves the midterm sentence). Self-contained questions pass through
 * unchanged; the expansion is used for retrieval only, never echoed back.
 */
export function expandQuestionWithHistory(question: string, history: ChatTurn[]): string {
  const ownTerms = significantWords(question, 3);
  const isFollowUp = FOLLOW_UP_CUE.test(question.trim()) || ownTerms.length < 2;
  if (!isFollowUp || history.length === 0) return question;

  const inherited: string[] = [];
  for (let i = history.length - 1; i >= 0 && inherited.length < 6; i -= 1) {
    if (history[i].role !== "user") continue;
    for (const term of significantWords(history[i].text, 3)) {
      if (!ownTerms.includes(term) && !inherited.includes(term)) inherited.push(term);
      if (inherited.length >= 6) break;
    }
  }
  return inherited.length > 0 ? `${question} ${inherited.join(" ")}` : question;
}

interface Retrieval {
  sentences: string[];
  /** 0..1 — fraction of the question's terms the selected passages contain.
   *  This is the engine's calibration signal: low values mean the passages only
   *  partly address the question, so the answer should be hedged. */
  confidence: number;
}

/** Sentences of `corpus` ranked by overlap with the question's significant words,
 *  weighting rarer words higher. Returns the top `max` in original order. */
function retrieveSentences(question: string, corpus: string, max: number): Retrieval {
  const sentences = splitSentences(corpus);
  const queryTerms = significantWords(question, 3);
  if (sentences.length === 0 || queryTerms.length === 0) {
    return { sentences: [], confidence: 0 };
  }

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

  const selected = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index);

  const selectedLower = selected.map((item) => item.sentence.toLowerCase()).join(" ");
  const covered = queryTerms.filter((term) => selectedLower.includes(term)).length;

  return {
    sentences: selected.map((item) => item.sentence),
    confidence: covered / queryTerms.length,
  };
}

/**
 * Answer a question from the given text extractively. Handles three intents:
 * summarize (extractive summary), define X (a definition sentence when the text
 * contains one), and general retrieval (the most relevant sentences, quoted).
 * When conversation history is provided, terse follow-ups are expanded with the
 * earlier turns' subject terms before retrieval.
 */
export function answerFromContext(question: string, corpus: string, history: ChatTurn[] = []): string {
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

  const retrievalQuery = expandQuestionWithHistory(q, history);
  const retrieval = retrieveSentences(retrievalQuery, text, 2);
  if (retrieval.sentences.length === 0) return NO_MATCH_REPLY;

  // Calibrated hedging: when the best passages cover only part of the question,
  // say so instead of presenting a partial match as a direct answer.
  const leadIn =
    retrieval.confidence >= 0.5
      ? pick(
          ["Here is what the text says about that:", "From the text:", "The relevant part of the text:"],
          q
        )
      : pick(
          [
            "This may only partly answer that; the closest passage is:",
            "The text only touches on that. The closest passage:",
          ],
          q
        );
  return `${leadIn} ${retrieval.sentences.join(" ")}`;
}
