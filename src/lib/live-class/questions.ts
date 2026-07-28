// Pure text logic for live-class mode: deciding what, in a live transcript,
// counts as a student question worth answering. No React, no Node built-ins,
// no "use server" - imported from both a client component (to surface a
// question as it is detected) and a server action (to answer it), and
// deterministic throughout: no Date.now(), no Math.random() - every
// timestamp and id comes in as a parameter.

/** One utterance from a transcription source (Web Speech API or the Gemini fallback). */
export interface Utterance {
  id: string;
  text: string;
  atMs: number;
  final: boolean;
}

/** A question detected in the live transcript, ready to be answered. */
export interface DetectedQuestion {
  id: string;
  text: string;
  atMs: number;
  confidence: number;
}

// Filler words tolerated at the very start of an utterance before checking
// for an interrogative opener - a live transcript is full of these ("um, so,
// how does...").
const LEADING_FILLERS = ["um", "uh", "so", "okay", "ok", "like"];

// Words that open a genuine question. Checked only against the first
// content word (after leading filler is stripped).
const INTERROGATIVE_OPENERS = [
  "what",
  "why",
  "how",
  "when",
  "where",
  "which",
  "who",
  "whose",
  "whom",
  "can",
  "could",
  "would",
  "should",
  "will",
  "does",
  "do",
  "did",
  "is",
  "are",
  "was",
  "were",
  "am",
  "may",
  "might",
  "must",
  "have",
  "has",
  "had",
];

// Phrases that read as an ask even when they are not the first words of the
// utterance ("Wait, so does that mean...", "...but what if..."). Exported so
// `looksLikeQuestion` and `scoreQuestion` (and their tests) share this one
// list instead of each keeping their own copy - a prior duplication is what
// let the two functions drift apart, with `scoreQuestion` under-crediting a
// phrase `looksLikeQuestion` already treated as a real ask.
export const EMBEDDED_ASK_PHRASES = [
  "i don't understand",
  "i'm confused",
  "what if",
  "how come",
  "wait, so",
  "does that mean",
  "can you explain",
  "can you go over",
  "why does",
  "what happens if",
];

// The rhetorical filter: phrases that grammatically look like a question but
// are the instructor prompting the room for engagement rather than a student
// actually asking one. Kept explicit (not a length/heuristic guess) so it is
// easy to extend. Matched against the WHOLE utterance (after leading filler
// and punctuation are stripped, and any trailing "?" is dropped) so a
// standalone rhetorical prompt is always filtered regardless of phrasing
// around the "?" itself.
const RHETORICAL_PROMPTS = [
  "any questions",
  "does that make sense",
  "make sense",
  "everyone good",
  "any thoughts",
  "right",
  "ok",
];

/** Lowercase and split into words, dropping all punctuation (including a trailing "?"). */
function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!;:"()[\]{}?]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Drop leading filler words ("um", "so", ...) - they carry no signal. */
function stripLeadingFillers(words: string[]): string[] {
  let i = 0;
  while (i < words.length && LEADING_FILLERS.includes(words[i])) i++;
  return words.slice(i);
}

/** True when the trimmed text ends in "?", tolerating a trailing quote or closing bracket after it. */
function endsWithQuestionMark(trimmedOriginal: string): boolean {
  return trimmedOriginal.replace(/["')\]}]+$/, "").endsWith("?");
}

/**
 * True for text that looks like a student question worth answering.
 *
 * True when the text ends in "?", opens with an interrogative word, or
 * contains an embedded ask phrase - case-insensitive and tolerant of leading
 * filler/punctuation. False for very short fragments (under 3 content words)
 * unless they are exactly two words ending in "?" ("why not?"); a single bare
 * interrogative word like "what?" is never enough on its own. False for the
 * instructor's rhetorical engagement prompts (see RHETORICAL_PROMPTS), which
 * are checked first so they can never slip through the other rules.
 */
export function looksLikeQuestion(text: string): boolean {
  if (typeof text !== "string") return false;
  const trimmedOriginal = text.trim();
  if (!trimmedOriginal) return false;

  const allWords = normalizeWords(trimmedOriginal);
  if (allWords.length === 0) return false;

  const words = stripLeadingFillers(allWords);
  if (words.length === 0) return false;

  const core = words.join(" ");
  if (RHETORICAL_PROMPTS.includes(core)) return false;

  const hasQuestionMark = endsWithQuestionMark(trimmedOriginal);

  // Very short fragments are not worth answering, even with a "?" - "what?"
  // alone carries no answerable content. A two-word fragment is allowed
  // through only when it ends in "?" ("why not?").
  if (words.length === 1) return false;
  if (words.length === 2) return hasQuestionMark;

  if (hasQuestionMark) return true;
  if (INTERROGATIVE_OPENERS.includes(words[0])) return true;

  const substringText = trimmedOriginal.toLowerCase().replace(/\s+/g, " ");
  return EMBEDDED_ASK_PHRASES.some((phrase) => substringText.includes(phrase));
}

// The bonus for an interrogative opener ("what", "why", "does", ...) and for
// an embedded ask phrase ("i don't understand", "i'm confused", ...) are
// deliberately equal: both are things `looksLikeQuestion` treats as a
// first-class "this is a real ask" signal, not a weaker one, so scoreQuestion
// must credit them the same way. Before this weight was equalized, "I'm
// confused about X" and "I don't understand Y" - the exact phrasing a student
// uses to say they are lost - scored below the default minConfidence even
// though looksLikeQuestion correctly flagged them as questions, silently
// discarding the most valuable utterances a live class assistant can catch.
const INTERROGATIVE_SIGNAL_WEIGHT = 0.25;

/**
 * Score, 0..1, how confidently `text` reads as an answerable question.
 * Higher for an explicit "?", an interrogative opener, an embedded ask phrase
 * (credited the same as an opener - see INTERROGATIVE_SIGNAL_WEIGHT), and a
 * length in the 5-40 word "sane" band for a spoken question; lower for very
 * long rambles and for text carrying no interrogative signal at all.
 * Deterministic - calling this twice with the same input always returns the
 * same number.
 *
 * Invariant: for any text where `looksLikeQuestion` is true, this must score
 * at or above `DEFAULT_MIN_CONFIDENCE` (enforced as a property test in
 * questions.test.ts) - `detectQuestions` relies on that to never silently
 * drop a text `looksLikeQuestion` already accepted.
 */
export function scoreQuestion(text: string): number {
  if (typeof text !== "string") return 0;
  const trimmedOriginal = text.trim();
  if (!trimmedOriginal) return 0;

  const hasQuestionMark = endsWithQuestionMark(trimmedOriginal);
  const words = stripLeadingFillers(normalizeWords(trimmedOriginal));
  const wordCount = words.length;
  const hasOpener = wordCount > 0 && INTERROGATIVE_OPENERS.includes(words[0]);
  const substringText = trimmedOriginal.toLowerCase().replace(/\s+/g, " ");
  const hasEmbeddedAsk = EMBEDDED_ASK_PHRASES.some((phrase) => substringText.includes(phrase));

  let score = 0.2; // baseline: some spoken content, no interrogative signal yet

  if (hasQuestionMark) score += 0.35;
  if (hasOpener) score += INTERROGATIVE_SIGNAL_WEIGHT;
  if (hasEmbeddedAsk) score += INTERROGATIVE_SIGNAL_WEIGHT;

  if (wordCount >= 5 && wordCount <= 40) {
    score += 0.1;
  } else if (wordCount > 40) {
    // Rambles: the further past the sane band, the more the score tapers.
    score -= Math.min(0.3, (wordCount - 40) * 0.01);
  } else if (wordCount > 0 && wordCount < 5) {
    score -= 0.05;
  }

  if (!hasQuestionMark && !hasOpener && !hasEmbeddedAsk) {
    // No interrogative signal whatsoever - discount heavily regardless of
    // length, so a bare statement never outscores an explicit question.
    score -= 0.3;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * The default confidence floor `detectQuestions` applies. Exported so tests
 * (and any future caller) check questions against the exact same number
 * `detectQuestions` uses by default, rather than a hard-coded 0.5 that could
 * silently drift out of sync with it.
 */
export const DEFAULT_MIN_CONFIDENCE = 0.5;

/**
 * Detect questions in a stream of utterances. Considers only `final`
 * utterances (an interim result is still being revised by the recognizer),
 * applies `looksLikeQuestion` then `scoreQuestion`, and keeps those at or
 * above `minConfidence` (default `DEFAULT_MIN_CONFIDENCE`). Preserves input
 * order. Never throws.
 */
export function detectQuestions(
  utterances: Utterance[],
  opts?: { minConfidence?: number }
): DetectedQuestion[] {
  if (!Array.isArray(utterances)) return [];
  const minConfidence = opts?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const results: DetectedQuestion[] = [];

  for (const u of utterances) {
    if (!u || !u.final) continue;
    const text = typeof u.text === "string" ? u.text : "";
    if (!looksLikeQuestion(text)) continue;
    const confidence = scoreQuestion(text);
    if (confidence >= minConfidence) {
      results.push({ id: u.id, text: text.trim(), atMs: u.atMs, confidence });
    }
  }

  return results;
}

/** Lowercase, strip punctuation, and collapse whitespace for near-duplicate comparison. */
function normalizeForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drop a candidate whose normalized text equals or is a near-duplicate of
 * something already answered, so the same question is never answered twice
 * as the recognizer revises its output mid-utterance. "Near-duplicate" means
 * one normalized string contains the other AND the shorter is at least 60%
 * of the longer's length.
 */
export function dedupeAgainstAnswered(
  candidates: DetectedQuestion[],
  answeredTexts: string[]
): DetectedQuestion[] {
  if (!Array.isArray(candidates)) return [];

  const answeredNormalized = (Array.isArray(answeredTexts) ? answeredTexts : [])
    .map(normalizeForDedupe)
    .filter((t) => t.length > 0);

  const isNearDuplicateOfAnswered = (candidateNorm: string): boolean => {
    if (!candidateNorm) return false;
    for (const answered of answeredNormalized) {
      if (candidateNorm === answered) return true;
      const shorter = candidateNorm.length <= answered.length ? candidateNorm : answered;
      const longer = candidateNorm.length <= answered.length ? answered : candidateNorm;
      if (longer.includes(shorter) && shorter.length >= longer.length * 0.6) return true;
    }
    return false;
  };

  return candidates.filter((c) => !isNearDuplicateOfAnswered(normalizeForDedupe(c.text ?? "")));
}

/**
 * Fold one incoming utterance into an existing list. If `incoming.id` matches
 * an existing entry, it replaces it in place (this is how a final result
 * upgrades its interim counterpart, and how an interim result gets revised by
 * a later interim with the same id); otherwise it is appended. Always
 * returns a NEW array - the input is never mutated.
 */
export function mergeInterim(existing: Utterance[], incoming: Utterance): Utterance[] {
  const list = Array.isArray(existing) ? existing : [];
  const idx = list.findIndex((u) => u.id === incoming.id);
  if (idx === -1) return [...list, incoming];

  const next = list.slice();
  next[idx] = incoming;
  return next;
}
