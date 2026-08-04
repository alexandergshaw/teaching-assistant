// Pure helpers for the current-events research pipeline
// (src/app/actions/current-events.ts). Split into a plain module (no "use
// server") because a Server Actions file may only export async functions -
// these clamps/parsers/builder are synchronous and unit-tested directly.
import type { Source } from "@/lib/llm";
import { jsonObjectSlice } from "@/app/actions/shared";

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Clamp a user-supplied maxTopics value to [1, 12], defaulting to 6. */
export function clampMaxTopics(raw: unknown): number {
  return clampInt(raw, 6, 1, 12);
}

/** Clamp a user-supplied itemsPerTopic value to [1, 10], defaulting to 5. */
export function clampItemsPerTopic(raw: unknown): number {
  return clampInt(raw, 5, 1, 10);
}

export interface ParsedTopic {
  topic: string;
  entities: string;
}

/**
 * Parse the topic-extraction model's response into a topic list, capped at
 * maxTopics. Tries JSON ({"topics":[{"topic":"...","entities":"..."}]}) first,
 * then falls back to treating each non-empty line as "topic" or
 * "topic - entities". Junk input (empty text, no parseable lines) returns [].
 */
export function parseTopicList(text: string, maxTopics: number): ParsedTopic[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const jsonText = jsonObjectSlice(trimmed);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as {
        topics?: Array<{ topic?: unknown; entities?: unknown }>;
      };
      if (Array.isArray(parsed.topics)) {
        const topics = parsed.topics
          .map((t) => ({
            topic: String(t.topic ?? "").trim(),
            entities: String(t.entities ?? "").trim(),
          }))
          .filter((t) => t.topic.length > 0);
        if (topics.length > 0) return topics.slice(0, maxTopics);
      }
    } catch {
      // Fall through to line parsing.
    }
  }

  const lines = trimmed
    .split("\n")
    .map((l) => l.replace(/^[\s*-]+/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter((l) => l.length > 0 && l.length < 200);

  const topics: ParsedTopic[] = [];
  for (const line of lines) {
    const dashSplit = line.split(/\s[-–]\s/);
    const topic = dashSplit[0].trim();
    const entities = dashSplit.slice(1).join(" - ").trim();
    if (topic) topics.push({ topic, entities });
    if (topics.length >= maxTopics) break;
  }
  return topics;
}

export interface ParsedTopicItem {
  headline: string;
  date: string;
  angle: string;
  whyItMatters: string;
  url: string;
  background: boolean;
  /** True when this item's URL was blanked because it was a placeholder or
   *  could not be corroborated by a grounding source. */
  unverified?: boolean;
}

/**
 * True for a URL that is (or looks like) a placeholder rather than a real,
 * fetchable page: any example.com/.org/.net/.edu host (and subdomains), any
 * host with "example" as one of its dot-separated labels (covers the general
 * "*.example.*" shape), localhost, or a bare IP address. Never throws - an
 * unparseable URL is not a usable citation, so it counts as a placeholder.
 */
export function isPlaceholderUrl(url: string): boolean {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return true;

  let host: string;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (!host) return true;

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // bare IPv4
  if (host.includes(":") && /^[0-9a-f:]+$/i.test(host)) return true; // bare IPv6

  return host.split(".").includes("example");
}

// Google's Search grounding redirector. `groundingChunks[].web.uri` is ALWAYS
// a link through this host, never the publisher's own URL - there is
// currently no field carrying the original URL (see the open feature request
// on Google's developer forum and googleapis/python-genai#1512). Treating it
// as a corroborating host would let the model's own fabricated
// "vertexaisearch.cloud.google.com/..." URL self-corroborate, so it is always
// excluded from the corroboration set below.
const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/** Lowercase a hostname, strip one leading "www.", and drop a trailing dot. */
function normalizeHost(host: string): string {
  let h = host.toLowerCase().trim();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

function isGroundingRedirectHost(host: string): boolean {
  return host === GROUNDING_REDIRECT_HOST || host.endsWith("." + GROUNDING_REDIRECT_HOST);
}

/**
 * The registrable "second-level" label of a normalized host: for
 * "news.aljazeera.com" and "aljazeera.com" alike, that's "aljazeera". Used
 * only to match a bare, single-label source title (see verifyItemUrls).
 */
function secondLevelLabel(host: string): string {
  const labels = host.split(".");
  return labels.length >= 2 ? labels[labels.length - 2] : labels[0];
}

/**
 * Keep an item's URL only when its host is corroborated by one of the
 * grounding sources actually returned for that topic; otherwise blank the URL
 * and mark the item unverified. A placeholder URL (see isPlaceholderUrl) is
 * always blanked and marked unverified, even if a source list is present.
 *
 * IMPORTANT: `source.uri` from Gemini's Search grounding is (almost) always a
 * `vertexaisearch.cloud.google.com/grounding-api-redirect/...` link, not the
 * publisher's URL - Google does not currently expose the original URL. What
 * Gemini DOES give us that names the real publisher is `source.title`, which
 * grounding populates with a bare domain (e.g. "python.org", "arxiv.org", or
 * sometimes just a registrable label like "aljazeera") rather than a page
 * title. So the corroboration set is built from BOTH signals: the source
 * URI's host (kept for the rare case a direct, non-redirect URL comes
 * through) AND the source title read as a domain. Do not "simplify" this
 * back to uri-host-only - on a real Google Search grounding response that
 * change makes every single item unverified, which is worse than not
 * verifying at all.
 */
export function verifyItemUrls(items: ParsedTopicItem[], sources: Source[]): ParsedTopicItem[] {
  const domainHosts = new Set<string>();
  const bareLabels = new Set<string>();

  for (const source of sources) {
    try {
      const uriHost = normalizeHost(new URL(source.uri).hostname);
      if (uriHost && !isGroundingRedirectHost(uriHost)) domainHosts.add(uriHost);
    } catch {
      // Skip an unparseable grounding source URI - it can't back anything.
    }

    // A title containing whitespace is a real sentence-like page title, not a
    // domain - grounding only omits the URL for the domain-as-title shape, so
    // a spaced title carries no host information we can use.
    const rawTitle = (source.title ?? "").trim();
    if (rawTitle && !/\s/.test(rawTitle)) {
      const normalizedTitle = normalizeHost(rawTitle);
      if (normalizedTitle.includes(".")) {
        if (!isGroundingRedirectHost(normalizedTitle)) domainHosts.add(normalizedTitle);
      } else if (normalizedTitle) {
        bareLabels.add(normalizedTitle);
      }
    }
  }

  const isCorroborated = (host: string): boolean => {
    if (isGroundingRedirectHost(host)) return false;
    for (const domain of domainHosts) {
      if (host === domain || host.endsWith("." + domain)) return true;
    }
    return bareLabels.size > 0 && bareLabels.has(secondLevelLabel(host));
  };

  return items.map((item) => {
    if (!item.url.trim() || isPlaceholderUrl(item.url)) {
      return { ...item, url: "", unverified: true };
    }
    let host: string;
    try {
      host = normalizeHost(new URL(item.url).hostname);
    } catch {
      return { ...item, url: "", unverified: true };
    }
    if (isCorroborated(host)) return item;
    return { ...item, url: "", unverified: true };
  });
}

const WINDOW_UNIT_MS: Record<string, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parse the common recency-window shapes the UI produces ("the past 30
 * days", "the last 3 months", "the past 2 weeks", "the past year", bare
 * "30 days") into a cutoff Date. A bare unit with no count (e.g. "the past
 * year") defaults to 1. Returns null when the shape can't be parsed at all,
 * so the caller knows not to filter anything.
 */
export function windowCutoff(window: string, now: Date): Date | null {
  const text = (window ?? "").trim().toLowerCase();
  if (!text) return null;

  const match = text.match(/(\d+)?\s*(day|week|month|year)s?\b/);
  if (!match) return null;

  const count = match[1] ? parseInt(match[1], 10) : 1;
  if (!Number.isFinite(count) || count <= 0) return null;

  const unit = match[2];
  const cutoff = new Date(now.getTime());
  if (unit === "day" || unit === "week") {
    cutoff.setTime(cutoff.getTime() - count * WINDOW_UNIT_MS[unit]);
  } else if (unit === "month") {
    cutoff.setMonth(cutoff.getMonth() - count);
  } else if (unit === "year") {
    cutoff.setFullYear(cutoff.getFullYear() - count);
  } else {
    return null;
  }
  return cutoff;
}

/**
 * Label an item "background" (surfacing the existing [background] tag in
 * both renderers) when its parsed date falls before the cutoff and it isn't
 * already flagged. An unparseable date, or a null cutoff (window shape not
 * recognized), leaves the item untouched.
 */
export function markOutOfWindow(items: ParsedTopicItem[], cutoff: Date | null): ParsedTopicItem[] {
  if (!cutoff) return items;
  return items.map((item) => {
    if (item.background) return item;
    const parsed = new Date(item.date);
    if (Number.isNaN(parsed.getTime())) return item;
    if (parsed.getTime() < cutoff.getTime()) return { ...item, background: true };
    return item;
  });
}

/**
 * Parse a per-topic (or whole-deck fallback) research response's
 * {"items":[...]} JSON into a tolerant array. Any malformed or missing shape
 * degrades to [] rather than throwing - a parse miss becomes an empty result
 * the caller treats as a failed attempt, never a crash. A placeholder URL
 * (see isPlaceholderUrl) is rejected up front: blanked and marked unverified,
 * so a fabricated citation can never survive parsing even before the
 * grounding-source cross-check runs.
 */
export function parseTopicItems(text: string): ParsedTopicItem[] {
  const jsonText = jsonObjectSlice(text);
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText) as { items?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((raw) => {
        const rawUrl = String(raw.url ?? "").trim();
        const placeholder = rawUrl.length > 0 && isPlaceholderUrl(rawUrl);
        return {
          headline: String(raw.headline ?? "").trim(),
          date: String(raw.date ?? "").trim(),
          angle: String(raw.angle ?? "").trim(),
          whyItMatters: String(raw.whyItMatters ?? "").trim(),
          url: placeholder ? "" : rawUrl,
          background: raw.background === true,
          ...(placeholder ? { unverified: true as const } : {}),
        };
      })
      .filter((item) => item.headline.length > 0);
  } catch {
    return [];
  }
}

/** Dedupe sources by URL, keeping the first-seen title for each URL. */
export function dedupeSourcesByUrl(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const deduped: Source[] = [];
  for (const source of sources) {
    if (!source.uri || seen.has(source.uri)) continue;
    seen.add(source.uri);
    deduped.push(source);
  }
  return deduped;
}

export interface TopicSection {
  topic: string;
  items: ParsedTopicItem[];
}

export interface CurrentEventsReportInput {
  window: string;
  itemsPerTopic: number;
  sections: TopicSection[];
  themes: string[];
  whatChanged: string;
  discussionPrompts: string[];
  sources: Source[];
  notes: string[];
  degraded: boolean;
  generatedAt?: Date;
}

/**
 * Build the plain-text current-events report: title, timestamp, recency
 * window, a coverage line, one section per topic, cross-cutting themes /
 * what-changed / discussion prompts, a numbered SOURCES section, and a NOTES
 * section carrying every per-topic failure and caveat. Plain-text headings
 * only - no docx, no markdown rendering dependency.
 */
export function buildCurrentEventsReport(input: CurrentEventsReportInput): string {
  const { window, itemsPerTopic, sections, themes, whatChanged, discussionPrompts, sources, notes, degraded } = input;
  const generatedAt = input.generatedAt ?? new Date();

  const lines: string[] = [];
  lines.push("CURRENT EVENTS REPORT");
  lines.push(`Generated: ${generatedAt.toISOString()}`);
  lines.push(`Recency window: ${window}`);
  lines.push(
    `Coverage: ${sections.length} topic(s) x ${itemsPerTopic} item(s), ${sources.length} source(s)${
      degraded ? " (DEGRADED - see NOTES)" : ""
    }`
  );
  lines.push("");

  for (const section of sections) {
    lines.push(`TOPIC: ${section.topic}`);
    if (section.items.length === 0) {
      lines.push("  (no items returned for this topic)");
    } else {
      for (const item of section.items) {
        const dateLabel = item.date || "undated";
        const angleLabel = item.angle ? ` (${item.angle})` : "";
        const backgroundLabel = item.background ? " [background]" : "";
        const unverifiedLabel = item.unverified ? " [unverified - no web source]" : "";
        lines.push(`  - [${dateLabel}]${angleLabel}${backgroundLabel} ${item.headline}${unverifiedLabel}`);
        if (item.whyItMatters) lines.push(`    Why it matters: ${item.whyItMatters}`);
        if (!item.unverified && item.url) lines.push(`    Source: ${item.url}`);
      }
    }
    lines.push("");
  }

  lines.push("CROSS-CUTTING THEMES");
  if (themes.length === 0) {
    lines.push("  (none identified)");
  } else {
    for (const theme of themes) lines.push(`  - ${theme}`);
  }
  lines.push("");

  lines.push("WHAT CHANGED SINCE THIS DECK WAS WRITTEN");
  lines.push(`  ${whatChanged.trim() || "(not available)"}`);
  lines.push("");

  lines.push("DISCUSSION PROMPTS");
  if (discussionPrompts.length === 0) {
    lines.push("  (none identified)");
  } else {
    discussionPrompts.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
  }
  lines.push("");

  lines.push("SOURCES");
  if (sources.length === 0) {
    lines.push("  No web sources were returned for this report.");
  } else {
    sources.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title}: ${s.uri}`));
  }
  lines.push("");

  lines.push("NOTES");
  if (notes.length === 0) {
    lines.push("  (none)");
  } else {
    for (const note of notes) lines.push(`  - ${note}`);
  }

  return lines.join("\n");
}

/**
 * Render one grounding source as a Sources-section bullet: a markdown link
 * with the domain/title as the visible, clickable text and the source's own
 * uri (often Google's opaque grounding redirect - see the verifyItemUrls doc
 * comment) as the link target. Guards against the model's own data producing
 * broken markdown-link syntax or an unusable citation:
 *  - an empty/whitespace title falls back to the uri as the visible text
 *  - an empty uri has nothing to link to, so it renders as plain text (no
 *    link at all) instead of an empty/broken link
 *  - a title containing "[" or "]" would break the `[text](url)` syntax
 *    itself, so those characters are stripped
 */
function sourceLinkMarkdown(source: Source): string {
  const uri = (source.uri ?? "").trim();
  const rawTitle = (source.title ?? "").trim();
  const visibleText = (rawTitle || uri).replace(/[[\]]/g, "");
  if (!uri) return visibleText;
  return `[${visibleText}](${uri})`;
}

/**
 * The same report as markdown-ish text, for rendering into a professional
 * .docx through buildDocxFromPlainText.
 *
 * The flat report above stays exactly as it is - it is the step's `reportText`
 * output, which other steps bind to, and its format is pinned by tests. This
 * is a SECOND rendering of the same input, following the pattern the lecture
 * Q&A step already uses: flat text for the output, markdown for the document.
 *
 * `#`/`##` headings and `- ` bullets are what give the docx builder its
 * structure; without them it falls back to line-length heuristics and an
 * all-caps line like "CROSS-CUTTING THEMES" renders as body text.
 */
export function buildCurrentEventsDocMarkdown(input: CurrentEventsReportInput): string {
  const { window, itemsPerTopic, sections, themes, whatChanged, discussionPrompts, sources, notes, degraded } =
    input;
  const generatedAt = input.generatedAt ?? new Date();

  const lines: string[] = [];
  lines.push("# Current Events Report");
  lines.push("");
  lines.push(`Generated: ${generatedAt.toISOString().slice(0, 10)}`);
  lines.push(`Recency window: ${window}`);
  lines.push(
    `Coverage: ${sections.length} topic(s) x ${itemsPerTopic} item(s), ${sources.length} source(s)${
      degraded ? " (DEGRADED - see Notes)" : ""
    }`
  );
  lines.push("");

  for (const section of sections) {
    lines.push(`## ${section.topic}`);
    lines.push("");
    if (section.items.length === 0) {
      lines.push("No items were returned for this topic.");
      lines.push("");
      continue;
    }
    for (const item of section.items) {
      const dateLabel = item.date || "undated";
      const angleLabel = item.angle ? ` (${item.angle})` : "";
      const backgroundLabel = item.background ? " [background]" : "";
      const unverifiedLabel = item.unverified ? " [unverified - no web source]" : "";
      // The headline is a level-0 bullet; "Why it matters" and "Source" are
      // level-1 sub-bullets indented by exactly 2 spaces (the docx contract's
      // bullet-level indent unit), so Word nests them under the headline
      // instead of showing three sibling bullets.
      lines.push(`- ${item.headline} - ${dateLabel}${angleLabel}${backgroundLabel}${unverifiedLabel}`);
      if (item.whyItMatters) lines.push(`  - Why it matters: ${item.whyItMatters}`);
      if (item.unverified) {
        lines.push(`  - Source: not corroborated by a web search result`);
      } else if (item.url) {
        // The docx builder turns a bare URL into a real hyperlink.
        lines.push(`  - Source: ${item.url}`);
      }
      lines.push("");
    }
  }

  lines.push("## Cross-cutting themes");
  lines.push("");
  if (themes.length === 0) {
    lines.push("None identified.");
  } else {
    for (const theme of themes) lines.push(`- ${theme}`);
  }
  lines.push("");

  lines.push("## What changed since this deck was written");
  lines.push("");
  lines.push(whatChanged.trim() || "Not available.");
  lines.push("");

  lines.push("## Discussion prompts");
  lines.push("");
  if (discussionPrompts.length === 0) {
    lines.push("None identified.");
  } else {
    for (const prompt of discussionPrompts) lines.push(`- ${prompt}`);
  }
  lines.push("");

  lines.push("## Sources");
  lines.push("");
  if (sources.length === 0) {
    lines.push("No web sources were returned for this report.");
  } else {
    // The docx builder now supports inline markdown links ([text](url)), so
    // the domain/title can be the visible, clickable text with the source's
    // uri (often Google's opaque grounding redirect) as the link target -
    // the opaque redirect no longer needs to be shown at all.
    for (const s of sources) lines.push(`- ${sourceLinkMarkdown(s)}`);
  }
  lines.push("");

  lines.push("## Notes");
  lines.push("");
  if (notes.length === 0) {
    lines.push("None.");
  } else {
    for (const note of notes) lines.push(`- ${note}`);
  }

  return lines.join("\n").trim();
}

// Moved to current-events-page-text.ts (a pure module with no
// "@/app/actions/shared" import) so the client-reachable
// steps.course-build-current-events.ts can import it without dragging
// next/headers into a browser bundle. Re-exported here under its original
// name so every existing importer and test is unchanged.
export { buildCurrentEventsPageText } from "@/lib/workflows/current-events-page-text";
