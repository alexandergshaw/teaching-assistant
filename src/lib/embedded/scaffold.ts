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

/** Uppercase the first character of a string. */
export function capitalizeFirst(text: string): string {
  const t = text.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
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
  const byLine = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•‣◦]|\d+[.)]|[a-z][.)])\s+/i, "").trim())
    .filter(Boolean);
  const items = byLine.length > 1 ? byLine : splitSentences(text);
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
