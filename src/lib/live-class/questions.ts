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
  // "cannot" is the expanded form `expandContractions` produces for both
  // "can't" and a bare "cannot" (see CONTRACTION_EXPANSIONS below). Listed
  // here so a contracted "Can't you..." keeps the same opener bonus in
  // scoreQuestion as its expanded twin, instead of losing it the moment the
  // modal verb is contracted.
  "cannot",
];

// Phrases that read as an ask even when they are not the first words of the
// utterance ("Wait, so does that mean...", "...but what if..."). Exported so
// `looksLikeQuestion` and `scoreQuestion` (and their tests) share this one
// list instead of each keeping their own copy - a prior duplication is what
// let the two functions drift apart, with `scoreQuestion` under-crediting a
// phrase `looksLikeQuestion` already treated as a real ask.
//
// Both functions match this list against text that has already gone through
// `expandContractions`, so every entry here MUST be spelled in its EXPANDED
// form ("i am confused", not "i'm confused"). A contracted spelling would
// never appear in the text being matched and would silently never fire.
// Because matching runs post-expansion, both "I'm confused" and "I am
// confused" (any spelling a speech recognizer or a typed transcript
// produces) reach the same normalized text and match identically - that
// symmetry is the fix for the spelling inconsistency that used to let "i'm
// confused" through while "i am confused" fell through the cracks.
export const EMBEDDED_ASK_PHRASES = [
  "i do not understand",
  "i am confused",
  "i cannot",
  "it is confusing",
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

// Maps a contracted form to the expanded form `expandContractions` replaces
// it with. Every target keeps the base word (the modal/auxiliary/pronoun)
// as its own token, in the same position it occupied in the contraction, so
// that expanding a contraction never moves an interrogative opener out of
// `words[0]` or changes which INTERROGATIVE_OPENERS/EMBEDDED_ASK_PHRASES
// entry it lines up with. That is what makes a contracted question and its
// expanded twin normalize to the identical word sequence, which is the
// whole fix: `looksLikeQuestion` and `scoreQuestion` stop treating them
// differently.
//
// Ambiguity note: several of these have more than one possible expansion in
// general English - "what's" is usually "what is" but can be "what has";
// "'d" can be "would" or "had"; "ain't" can stand in for "am not", "is not",
// or "are not". This function is used ONLY for question detection, never
// for display or grammar correction, so each entry below picks whichever
// expansion is correct for THAT purpose (the one that best preserves the
// interrogative signal) and makes no attempt to disambiguate further.
// "can't" and the bare word "cannot" both expand to "cannot" (rather than
// "can not") so a contracted "Can't you..." and a spelled-out "Cannot
// you..." normalize to the exact same token - see the "cannot" entry added
// to INTERROGATIVE_OPENERS above.
const CONTRACTION_EXPANSIONS: Array<[contracted: string, expanded: string]> = [
  ["what's", "what is"],
  ["who's", "who is"],
  ["where's", "where is"],
  ["when's", "when is"],
  ["why's", "why is"],
  ["how's", "how is"],
  ["that's", "that is"],
  ["there's", "there is"],
  ["here's", "here is"],
  ["it's", "it is"],
  ["he's", "he is"],
  ["she's", "she is"],
  ["let's", "let us"],
  ["what're", "what are"],
  ["we're", "we are"],
  ["they're", "they are"],
  ["you're", "you are"],
  ["i'm", "i am"],
  ["i've", "i have"],
  ["we've", "we have"],
  ["you've", "you have"],
  ["they've", "they have"],
  ["i'd", "i would"],
  ["we'd", "we would"],
  ["you'd", "you would"],
  ["i'll", "i will"],
  ["we'll", "we will"],
  ["you'll", "you will"],
  ["don't", "do not"],
  ["doesn't", "does not"],
  ["didn't", "did not"],
  ["can't", "cannot"],
  ["won't", "will not"],
  ["wouldn't", "would not"],
  ["couldn't", "could not"],
  ["shouldn't", "should not"],
  ["isn't", "is not"],
  ["aren't", "are not"],
  ["wasn't", "was not"],
  ["weren't", "were not"],
  ["haven't", "have not"],
  ["hasn't", "has not"],
  ["hadn't", "had not"],
  ["ain't", "is not"],
];

// One compiled regex per contraction: matches on a word boundary (so a bare
// word that merely looks similar, like "wont" or "cant", is never touched),
// case-insensitively, and accepts EITHER the straight apostrophe (') or the
// typographic/curly apostrophe (U+2019, the character iOS/Android keyboards
// and several speech-to-text engines actually emit) in place of the plain
// one written in CONTRACTION_EXPANSIONS above.
const CONTRACTION_PATTERNS: Array<{ pattern: RegExp; expanded: string }> = CONTRACTION_EXPANSIONS.map(
  ([contracted, expanded]) => {
    const escaped = contracted.replace(/'/g, "['’]");
    return { pattern: new RegExp(`\\b${escaped}\\b`, "gi"), expanded };
  }
);

/**
 * Expand contracted forms ("what's", "don't", "can't", ...) to their
 * uncontracted equivalents, so downstream matching (interrogative openers,
 * embedded ask phrases, question marks) sees the same words whether the
 * speaker said "what's" or "what is". Pure and case-insensitive; matches on
 * word boundaries so ordinary words that merely resemble a contraction
 * ("wont", "cant") are left untouched. See CONTRACTION_EXPANSIONS for the
 * full list and the ambiguity notes on how each one is resolved.
 */
export function expandContractions(text: string): string {
  if (typeof text !== "string") return "";
  let result = text;
  for (const { pattern, expanded } of CONTRACTION_PATTERNS) {
    result = result.replace(pattern, expanded);
  }
  return result;
}

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

  // Normalize contractions before any matching happens, so "What's" and
  // "What is" - and every other contraction/expansion pair - are judged
  // identically from this point on.
  const expanded = expandContractions(trimmedOriginal);

  const allWords = normalizeWords(expanded);
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

  const substringText = expanded.toLowerCase().replace(/\s+/g, " ");
  return EMBEDDED_ASK_PHRASES.some((phrase) => substringText.includes(phrase));
}

// The bonus for an interrogative opener ("what", "why", "does", ...) and for
// an embedded ask phrase ("i do not understand", "i am confused", ...) are
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

  // Same normalization `looksLikeQuestion` applies, and for the same reason:
  // without it, a contraction and its expansion produce different word
  // sequences and drift to different scores even when looksLikeQuestion
  // already treats them as the same question.
  const expanded = expandContractions(trimmedOriginal);

  const hasQuestionMark = endsWithQuestionMark(trimmedOriginal);
  const words = stripLeadingFillers(normalizeWords(expanded));
  const wordCount = words.length;
  const hasOpener = wordCount > 0 && INTERROGATIVE_OPENERS.includes(words[0]);
  const substringText = expanded.toLowerCase().replace(/\s+/g, " ");
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
