// Link resolution for live-class answers (see src/app/actions/live-class.ts's
// answerLiveQuestionAction). No React, no Node built-ins, no "use server" -
// importable from both a server action and a plain unit test, exactly like
// the other modules in this directory (session.ts, questions.ts).
//
// THE DESIGN DECISION THAT MATTERS MOST: CODE RESOLVES LINKS, THE MODEL NEVER
// EMITS THEM. A generated report once shipped citing four fabricated URLs
// (www.example.com/research/..., research.cs.example.edu/...) because
// nothing verified a model-emitted link. Asking a model for a documentation
// URL live, in front of a class, would reproduce that failure in the worst
// possible place. So the model names CONCEPTS (plain words, no links - see
// buildAnswerPrompt's explicit "never write a URL" instruction) and every
// function below turns a concept name into a link by CODE: resolveDocsLinks
// only ever returns a URL that is a literal value in CURATED_DOCS_MAP below,
// and resolveVisualizerLinks only ever returns a URL built from a REAL
// visualizer nav entry that was actually found in the parsed index - neither
// function invents or guesses a URL under any circumstance. stripModelUrls is
// the last line of defense: applied to the answer text regardless, so a
// model that ignores the "no URLs" instruction can never leak a fabricated
// link to the panel or the end-of-class document.

import { VISUALIZER_TOPICS, matchConcept, conceptUrl } from "@/lib/visualizer";

/** One link resolved for a live-class answer. `kind` is what AnswersPanel.tsx
 * (and buildSessionMarkdown in ./session.ts) use to visually distinguish a
 * visualizer link from a documentation link. */
export interface AnswerLink {
  label: string;
  url: string;
  kind: "visualizer" | "docs";
}

// ─────────────────────────────────────────────────────────────────────────
// stripModelUrls
// ─────────────────────────────────────────────────────────────────────────

// Markdown link syntax the model might emit anyway, despite the prompt's
// explicit instruction not to - tried first (mirrors docx-blocks.ts's own
// INLINE_LINK_RE precedence: a markdown link always wins over a bare-URL
// match at the same position) so its url portion is never left behind to be
// caught a second time by BARE_URL_RE below. Restricted to an explicit
// http(s):// or www. target, same scope as the bare-URL pattern.
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(\s*((?:https?:\/\/|www\.)[^\s)]+)\s*\)/gi;

// A bare URL the model might emit: an explicit http(s):// scheme, or a
// www.-prefixed domain (the exact shape of the fabricated citations that
// motivated this module - see the header comment). Stops at whitespace or a
// closing bracket/paren, mirroring the app's existing bare-URL convention
// (docx-blocks.ts's INLINE_LINK_RE).
const BARE_URL_RE = /(?:https?:\/\/|www\.)[^\s)\]]+/gi;

/**
 * Strip any URL the model emitted anyway: a markdown `[text](url)` link
 * collapses to just its text (the link's "text left behind" - the whole
 * point is a student still reads a coherent sentence, not a hole where a
 * link used to be); a bare URL is removed outright, since there is no
 * associated text to keep. Whitespace left behind by a removal is collapsed
 * (runs of spaces/tabs on a line become one space, each line is trimmed) -
 * line breaks themselves are preserved, since the answer is a bulleted list.
 * Never throws - a non-string input degrades to an empty string.
 */
export function stripModelUrls(text: string): string {
  const input = typeof text === "string" ? text : "";
  try {
    let result = input.replace(MARKDOWN_LINK_RE, (_match, label: string) => (label ?? "").trim());
    result = result.replace(BARE_URL_RE, "");
    return result
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  } catch {
    return input;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// resolveDocsLinks
// ─────────────────────────────────────────────────────────────────────────

// CURATED, hand-maintained map from a concept/language keyword to its
// OFFICIAL documentation. Every entry's url MUST be an official documentation
// ROOT (the site's own top-level docs landing page), NEVER a deep link into a
// specific article or version - a deep link rots (gets reorganized, moved,
// 404s) in a way a root essentially never does. Keys are matched
// case-insensitively as a whole word (or phrase) against a concept name or
// the course's language hint - see matchDocsKeyword. Several keys
// deliberately point at the SAME AnswerLink (aliases: "js"/"javascript",
// "postgres"/"postgresql", ...) so a concept can be phrased either way.
//
// SQL is deliberately NOT given a generic entry here: only a NAMED engine
// (MySQL, PostgreSQL, SQLite, SQL Server) resolves to a link. A concept that
// just says "SQL" or "databases" with no named engine contributes no link -
// inventing a generic "SQL docs" URL was explicitly the failure mode this
// module exists to avoid.
export const CURATED_DOCS_MAP: Record<string, AnswerLink> = {
  python: { label: "Python documentation", url: "https://docs.python.org/3/", kind: "docs" },

  javascript: {
    label: "JavaScript documentation (MDN)",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    kind: "docs",
  },
  js: {
    label: "JavaScript documentation (MDN)",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    kind: "docs",
  },
  "web api": {
    label: "Web APIs documentation (MDN)",
    url: "https://developer.mozilla.org/en-US/docs/Web/API",
    kind: "docs",
  },
  "web apis": {
    label: "Web APIs documentation (MDN)",
    url: "https://developer.mozilla.org/en-US/docs/Web/API",
    kind: "docs",
  },

  typescript: { label: "TypeScript documentation", url: "https://www.typescriptlang.org/docs/", kind: "docs" },
  ts: { label: "TypeScript documentation", url: "https://www.typescriptlang.org/docs/", kind: "docs" },

  react: { label: "React documentation", url: "https://react.dev/", kind: "docs" },

  html: { label: "HTML documentation (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/HTML", kind: "docs" },
  css: { label: "CSS documentation (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/CSS", kind: "docs" },

  git: { label: "Git documentation", url: "https://git-scm.com/doc", kind: "docs" },
  github: { label: "GitHub documentation", url: "https://docs.github.com/", kind: "docs" },

  // Named SQL engines only - see the comment above this map.
  mysql: { label: "MySQL documentation", url: "https://dev.mysql.com/doc/", kind: "docs" },
  postgresql: { label: "PostgreSQL documentation", url: "https://www.postgresql.org/docs/", kind: "docs" },
  postgres: { label: "PostgreSQL documentation", url: "https://www.postgresql.org/docs/", kind: "docs" },
  sqlite: { label: "SQLite documentation", url: "https://www.sqlite.org/docs.html", kind: "docs" },
  "sql server": {
    label: "SQL Server documentation",
    url: "https://learn.microsoft.com/en-us/sql/sql-server/",
    kind: "docs",
  },
  mssql: {
    label: "SQL Server documentation",
    url: "https://learn.microsoft.com/en-us/sql/sql-server/",
    kind: "docs",
  },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match `candidate` against CURATED_DOCS_MAP's keys, whole-word (so "css"
 * never matches inside "access", and "ts" never matches inside "typescript"
 * looking for a DIFFERENT key). Returns the mapped AnswerLink verbatim (never
 * a constructed or guessed URL) or null when nothing matches. */
function matchDocsKeyword(candidate: string): AnswerLink | null {
  const normalized = (candidate ?? "").toLowerCase().trim();
  if (!normalized) return null;
  for (const [key, link] of Object.entries(CURATED_DOCS_MAP)) {
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
    if (pattern.test(normalized)) return link;
  }
  return null;
}

/**
 * Resolve official documentation links for a set of concept names (the
 * model's CONCEPTS: line, already parsed) plus an optional language hint.
 * Every concept AND the language hint (when supplied) are checked against
 * CURATED_DOCS_MAP; a concept that matches nothing contributes NO link -
 * this function never guesses or constructs a URL, it only ever returns a
 * value that already lives in the curated map. Deduped by url.
 */
export function resolveDocsLinks(
  concepts: string[],
  hints: { courseName?: string; moduleName?: string; language?: string }
): AnswerLink[] {
  const results: AnswerLink[] = [];
  const seenUrls = new Set<string>();

  const addIfMatched = (candidate: string | undefined) => {
    const link = matchDocsKeyword(candidate ?? "");
    if (!link || seenUrls.has(link.url)) return;
    seenUrls.add(link.url);
    results.push(link);
  };

  for (const concept of Array.isArray(concepts) ? concepts : []) {
    addIfMatched(concept);
  }
  addIfMatched(hints?.language);

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// resolveVisualizerLinks
// ─────────────────────────────────────────────────────────────────────────

/** One entry of the visualizer's parsed nav index - the same shape
 * parseNavItems (src/lib/visualizer.ts) returns. Loaded ONCE per session by
 * loadVisualizerIndexAction (src/app/actions/live-class.ts) and threaded
 * through LiveSessionContext / LiveQuestionContext.visualizerIndex, so
 * resolveVisualizerLinks below is a pure, local, no-network match against
 * already-fetched data - never a per-question GitHub round trip. */
export interface VisualizerIndexEntry {
  topicExport: string;
  label: string;
  value: string;
}

/**
 * Resolve visualizer concept-page links for a set of concept names, matching
 * locally against an already-loaded index via matchConcept - no network call.
 * A concept with no match in `index` contributes NO link, and a match whose
 * topic is not `creatable` (one of the five UnderConstruction stub topics -
 * see VISUALIZER_TOPICS's doc comment in src/lib/visualizer.ts) is also
 * skipped: visiting it would be a link to a page with no working switch/case
 * to render the concept, i.e. a dead link, which is worse than no link at
 * all. Never fabricates a URL for a page that does not exist.
 */
export function resolveVisualizerLinks(concepts: string[], index: VisualizerIndexEntry[]): AnswerLink[] {
  const results: AnswerLink[] = [];
  const entries = Array.isArray(index) ? index : [];

  for (const concept of Array.isArray(concepts) ? concepts : []) {
    const trimmed = (concept ?? "").trim();
    if (!trimmed) continue;

    const match = matchConcept(entries, trimmed);
    if (!match) continue;

    const topic = VISUALIZER_TOPICS.find((t) => t.navExport === match.topicExport);
    if (!topic || !topic.creatable) continue;

    results.push({ label: match.label, url: conceptUrl(topic.route, match.value), kind: "visualizer" });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// dedupeLinks
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_LINKS = 4;

/**
 * Dedupe a combined link list by url (first occurrence wins), then order
 * visualizer links before documentation links, then cap at `max` (default
 * 4). Used to combine resolveVisualizerLinks's and resolveDocsLinks's output
 * into the one list an answer actually ships with.
 */
export function dedupeLinks(links: AnswerLink[], max: number = DEFAULT_MAX_LINKS): AnswerLink[] {
  const seenUrls = new Set<string>();
  const deduped: AnswerLink[] = [];
  for (const link of Array.isArray(links) ? links : []) {
    if (!link || !link.url || seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    deduped.push(link);
  }

  const ordered = [...deduped.filter((l) => l.kind === "visualizer"), ...deduped.filter((l) => l.kind !== "visualizer")];
  const cap = Number.isFinite(max) && max >= 0 ? Math.floor(max) : DEFAULT_MAX_LINKS;
  return ordered.slice(0, cap);
}
