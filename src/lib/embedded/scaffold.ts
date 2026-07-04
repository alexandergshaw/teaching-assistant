/**
 * Shared text utilities for the Embedded Deterministic Engine's content
 * scaffolds. When the embedded provider is selected, generative features build
 * their output from the instructor's own inputs with these rule-based helpers
 * instead of calling a language model. Nothing here invents facts: it extracts,
 * reshapes, and templates the text it is given, so the same input always yields
 * the same output.
 */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "this", "that", "from", "into",
  "will", "shall", "should", "would", "could", "have", "has", "had", "are", "was",
  "were", "been", "being", "about", "how", "why", "what", "when", "where", "who",
  "able", "understand", "learn", "learners", "students", "student", "module",
  "lesson", "unit", "course", "concept", "concepts", "topic", "topics", "using",
  "use", "used", "apply", "applies", "explain", "explains", "describe", "identify",
  "analyze", "explore", "create", "build", "develop", "implement", "demonstrate",
  "each", "them", "they", "their", "there", "then", "than", "these", "those",
  "not", "but", "all", "any", "can", "may", "our", "out", "get", "its", "it's",
]);

/** Collapse runs of whitespace and trim. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Deterministic 32-bit FNV-1a hash of a string. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Choose one of several phrasings deterministically from a seed, so the same
 * input always yields the same wording but different inputs vary their phrasing
 * (instead of every output reusing one fixed sentence). Falls back to the first
 * variant for an empty list.
 */
export function pick<T>(variants: T[], seed: string): T {
  if (variants.length === 0) throw new Error("pick requires at least one variant");
  return variants[hashString(seed) % variants.length];
}

/** Uppercase the first character of a string. */
export function capitalizeFirst(text: string): string {
  const t = text.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * Remove long dashes from text. A dash between spaces becomes a comma,
 * and any remaining (e.g. in number ranges) becomes a plain hyphen.
 */
export function stripLongDashes(text: string): string {
  return text.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "-");
}

/** Ensure the text ends with sentence-terminating punctuation. */
export function ensureSentence(text: string): string {
  const t = cleanText(text);
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

/** Split prose into sentences (best-effort, punctuation-based). */
export function splitSentences(text: string): string[] {
  return cleanText(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Split an objectives / instructions blob into discrete list items: explicit
 * lines and bullet markers first, falling back to sentences when it is one block.
 */
export function toBullets(text: string): string[] {
  const stripMarker = (value: string): string =>
    value.replace(/^\s*(?:[-*•‣◦]|\d+[.)]|[a-z][.)])\s+/i, "").trim();
  const byLine = text.split(/\r?\n/).map(stripMarker).filter(Boolean);
  // Single-line input: fall back to sentences, still stripping a leading marker.
  const items = byLine.length > 1 ? byLine : splitSentences(text).map(stripMarker).filter(Boolean);
  return dedupe(items);
}

// Pedagogical lead-ins that describe the learner rather than the subject.
const OBJECTIVE_PREFIX =
  /^(?:by the end of (?:this )?(?:module|lesson|unit|course),?\s*)?(?:the\s+)?(?:students?|learners?|you|we)?\s*(?:will\s+)?(?:be able to\s+)?(?:understand|learn(?:\s+about)?|explain|describe|identify|apply|analyze|analyse|explore|demonstrate|use|implement|create|build|develop|master|know|recognize|recognise|define|discuss|examine|gain (?:an )?understanding of|become familiar with)?\s*(?:how\s+to\s+|the\s+|about\s+|what\s+|why\s+|that\s+)?/i;

/**
 * Derive a concise subject phrase from objectives (or context), stripping the
 * "students will be able to …" scaffolding so the topic itself is left.
 */
export function deriveTopic(
  objectives: string,
  context = "",
  fallback = "this module's concepts"
): string {
  const first = toBullets(objectives)[0] || splitSentences(context)[0] || "";
  let topic = first.replace(OBJECTIVE_PREFIX, "").trim().replace(/[.:;,]+$/, "").trim();
  if (!topic) return fallback;
  const words = topic.split(/\s+/);
  if (words.length > 10) topic = words.slice(0, 10).join(" ");
  return topic.toLowerCase();
}

/** A short, capitalized title derived from the objectives. */
export function deriveTitle(objectives: string, context = "", fallback = "Module"): string {
  const topic = deriveTopic(objectives, context, "");
  if (!topic) return fallback;
  return capitalizeFirst(topic);
}

/**
 * Pull salient key phrases from the text: quoted terms, backtick code terms,
 * multi-word Capitalized Sequences, then the most frequent significant words.
 */
export function keyPhrases(text: string, limit = 6): string[] {
  const phrases: string[] = [];

  const quoted = text.matchAll(/["'`“”]([A-Za-z][A-Za-z0-9 _\-]{1,40})["'`“”]/g);
  for (const m of quoted) phrases.push(cleanText(m[1]));

  const capitalized = text.matchAll(/\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){1,3})\b/g);
  for (const m of capitalized) phrases.push(cleanText(m[1]));

  // Frequent single words as a fallback signal.
  const freq = new Map<string, number>();
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 4 && !STOPWORDS.has(word)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  const frequent = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);

  return dedupe([...phrases, ...frequent]).slice(0, limit);
}

export interface CodeBlock {
  code: string;
  /** Language from the fence label ("```python"), when one was given. */
  language?: string;
}

/**
 * Extract fenced code blocks (``` ... ```) from markdown-ish text, so real code
 * from a README or assignment brief can be shown on example slides instead of a
 * placeholder stub. Blocks are returned in document order, fences stripped.
 */
export function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const re = /```([A-Za-z0-9+#-]*)\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const code = match[2].replace(/\s+$/, "");
    if (!code.trim()) continue;
    const language = match[1].trim().toLowerCase();
    blocks.push({ code, ...(language ? { language } : {}) });
  }
  return blocks;
}

export type LessonType = "math" | "programming" | "general";

const PROGRAMMING_SIGNALS =
  /\b(?:python|java|javascript|typescript|c\+\+|code|coding|program(?:ming)?|function|variable|loop|array|class|method|api|algorithm|compile|syntax|sql|html|css|react|node|debug|data\s?structure)\b/i;
const MATH_SIGNALS =
  /\b(?:equation|theorem|derivative|integral|matrix|matrices|probability|statistic|statistics|calculus|algebra|geometry|proof|formula|solve\s+for|vector|polynomial|logarithm|trigonometry)\b/i;

/** Classify a lesson as math, programming, or general from its text signals. */
export function detectLessonType(text: string): LessonType {
  if (PROGRAMMING_SIGNALS.test(text)) return "programming";
  if (MATH_SIGNALS.test(text)) return "math";
  return "general";
}

const LANGUAGE_SIGNALS: Array<{ test: RegExp; language: string }> = [
  { test: /\btypescript\b/i, language: "typescript" },
  { test: /\bjavascript\b|\bnode(?:\.js)?\b|\breact\b/i, language: "javascript" },
  { test: /\bjava\b/i, language: "java" },
  { test: /\bc\+\+\b|\bcpp\b/i, language: "cpp" },
  { test: /\bc#\b|\bcsharp\b/i, language: "csharp" },
  { test: /\bsql\b/i, language: "sql" },
  { test: /\bhtml\b/i, language: "html" },
  { test: /\bpython\b|\bpandas\b|\bnumpy\b/i, language: "python" },
];

/** Best-guess programming language label for code examples (defaults to python). */
export function detectLanguage(text: string): string {
  for (const signal of LANGUAGE_SIGNALS) {
    if (signal.test.test(text)) return signal.language;
  }
  return "python";
}

/** The distinct significant words of a text (min length, not a stopword). */
export function significantWords(text: string, minLength = 4): string[] {
  const seen = new Set<string>();
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= minLength && !STOPWORDS.has(word)) seen.add(word);
  }
  return [...seen];
}

/** Significant-word frequencies (length >= 4, not a stopword), for scoring. */
function termFrequencies(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 4 && !STOPWORDS.has(word)) freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  return freq;
}

/**
 * Extractive summary: score each sentence by the frequency of the significant
 * words it contains (length-normalized, with a small first-sentence bonus) and
 * return the top {@link maxSentences} in their original order. This lets an
 * overview reflect the actual source text the way an LLM summary would, without
 * inventing anything — every sentence returned came from the input verbatim.
 */
export function summarize(text: string, maxSentences = 2): string {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return sentences.join(" ");

  const freq = termFrequencies(text);
  const scored = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const raw = words.reduce((sum, word) => sum + (freq.get(word) ?? 0), 0);
    const normalized = words.length > 0 ? raw / Math.sqrt(words.length) : 0;
    return { sentence, index, score: normalized * (index === 0 ? 1.2 : 1) };
  });

  return [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)
    .join(" ");
}

// Meaning-preserving plain-language substitutions (wordy phrase -> concise form).
const WORDINESS: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, "to"],
  [/\bfor the purpose of\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\bin the event that\b/gi, "if"],
  [/\bat (?:this|the present) point in time\b/gi, "now"],
  [/\bat the present time\b/gi, "now"],
  [/\bin the near future\b/gi, "soon"],
  [/\b(?:with|in) regard to\b/gi, "about"],
  [/\ba large number of\b/gi, "many"],
  [/\bthe majority of\b/gi, "most"],
  [/\bon a daily basis\b/gi, "daily"],
];

// Empty intensifiers that add nothing; removed as leading words.
const FILLER = /\b(?:very|really|basically|actually|simply|quite|extremely|totally|literally)\s+/gi;

/**
 * Light, meaning-preserving copy-edit of a paragraph: collapses whitespace, cuts
 * wordy phrases and empty intensifiers, removes accidental repeated words, fixes
 * punctuation spacing, and normalizes sentence capitalization and terminal
 * punctuation. This is the embedded counterpart to an LLM "make this clearer"
 * pass, applied by rule so the same paragraph always edits the same way.
 */
export function copyedit(text: string): string {
  let out = cleanText(text);
  if (!out) return out;

  for (const [pattern, replacement] of WORDINESS) out = out.replace(pattern, replacement);
  out = out.replace(FILLER, "");
  // Collapse accidental repeated words ("the the" -> "the").
  out = out.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");
  // No space before punctuation; one space after a comma/semicolon/colon that a
  // letter follows directly (leaves numbers like 3,000 and 10:30 alone).
  out = out.replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:])(?=[A-Za-z])/g, "$1 ");
  // Collapse repeated terminal punctuation.
  out = out.replace(/([!?])\1+/g, "$1");
  // Capitalize the first letter of each sentence.
  out = out.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
  return ensureSentence(cleanText(out));
}

/** Lowercase the first character of a string. */
function lowerFirst(text: string): string {
  const t = text.trim();
  return t ? t[0].toLowerCase() + t.slice(1) : t;
}

// Leading words that never begin a real glossary term (pronouns, articles, and
// pedagogical nouns that show up in syllabus prose).
const NON_TERM_LEAD = new Set([
  "this", "that", "these", "those", "it", "they", "there", "here", "we", "you",
  "i", "he", "she", "his", "her", "their", "our", "its", "the", "a", "an",
  "students", "student", "learners", "assignment", "assignments", "homework",
  "quiz", "exam", "midterm", "final", "lecture", "week", "grade", "grading",
]);

export interface Definition {
  term: string;
  /** A full sentence that defines the term. */
  definition: string;
}

/**
 * Extract term definitions from the text so a glossary can state what each key
 * term means, the way an LLM would. Recognizes "Term is/are …", "Term refers to /
 * means / is defined as …", and "Term: definition" lines. Every definition is a
 * sentence taken (and lightly normalized) from the input, so nothing is invented.
 */
export function extractDefinitions(text: string, limit = 6): Definition[] {
  const out: Definition[] = [];
  const seen = new Set<string>();
  const rejects = (term: string): boolean => {
    const words = term.trim().split(/\s+/);
    return words.length === 0 || words.length > 5 || NON_TERM_LEAD.has(words[0].toLowerCase());
  };
  const add = (term: string, definition: string) => {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key) || rejects(term)) return;
    seen.add(key);
    out.push({ term: term.trim(), definition: cleanText(definition) });
  };

  // "Term: definition" label lines.
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z0-9 /\-]{1,39}):\s+(.{6,})$/.exec(line.trim());
    if (m && !/\bhttps?:/i.test(m[2])) {
      add(m[1], ensureSentence(`${capitalizeFirst(m[1].trim())} is ${lowerFirst(m[2])}`));
    }
  }

  // "Term is/are/refers to/means/is defined as … " sentences. Sentences are
  // gathered per line (with bullet markers stripped) so a list item never glues
  // onto the sentence that follows it.
  const sentences = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•‣◦]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .flatMap((line) => splitSentences(line));
  for (const sentence of sentences) {
    const m = /^([A-Za-z][A-Za-z0-9 /\-]{1,39}?)\s+(?:is|are|refers to|means|is defined as|describes)\s+(.{6,})$/i.exec(
      sentence
    );
    if (!m) continue;
    add(m[1], ensureSentence(capitalizeFirst(sentence)));
  }

  return out.slice(0, limit);
}

/** A single sentence summarizing what the objectives ask the learner to do. */
export function summarizeObjectives(objectives: string, max = 3): string {
  const bullets = toBullets(objectives)
    .map((b) => b.replace(OBJECTIVE_PREFIX, "").replace(/[.:;,]+$/, "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, max);
  if (bullets.length === 0) return "";
  if (bullets.length === 1) return ensureSentence(`You will work with ${bullets[0]}`);
  const last = bullets[bullets.length - 1];
  const rest = bullets.slice(0, -1).join(", ");
  return ensureSentence(`You will work with ${rest}, and ${last}`);
}
