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
}

/**
 * Parse a per-topic (or whole-deck fallback) research response's
 * {"items":[...]} JSON into a tolerant array. Any malformed or missing shape
 * degrades to [] rather than throwing - a parse miss becomes an empty result
 * the caller treats as a failed attempt, never a crash.
 */
export function parseTopicItems(text: string): ParsedTopicItem[] {
  const jsonText = jsonObjectSlice(text);
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText) as { items?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((raw) => ({
        headline: String(raw.headline ?? "").trim(),
        date: String(raw.date ?? "").trim(),
        angle: String(raw.angle ?? "").trim(),
        whyItMatters: String(raw.whyItMatters ?? "").trim(),
        url: String(raw.url ?? "").trim(),
        background: raw.background === true,
      }))
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
        lines.push(`  - [${dateLabel}]${angleLabel}${backgroundLabel} ${item.headline}`);
        if (item.whyItMatters) lines.push(`    Why it matters: ${item.whyItMatters}`);
        if (item.url) lines.push(`    Source: ${item.url}`);
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
