// Pure helpers for turning the resource-search structuring call's response
// into candidate resource items, and for building the "sources visited"
// block that call's prompt carries (docs/reply-resource-search-yield-
// acceptance-criteria.md Y2). Split out of
// src/app/actions/learning-resource-links.ts (a "use server" module, whose
// export surface is otherwise limited to async functions) into a plain leaf
// so these are unit-testable directly and so that file stays under the
// repo's 1000-line cap.
import { jsonObjectSlice } from "@/lib/json-slice";
import { sanitizeResourceUrl } from "@/lib/urls";
import { coerceResourceKind, type ResourceKind } from "@/lib/resource-kind";
import type { Source } from "@/lib/llm";

/** A candidate resource before its url has been corroborated or reachability-
 *  checked - never returned to a caller directly, only via a caller's own
 *  verified/kept representation of it. */
export interface CandidateResourceItem {
  title: string;
  url: string;
  kind: ResourceKind;
  whatYouGet: string;
}

/** Oxford-comma join of already-formatted items - `a`, `a or b`,
 *  `a, b, or c` - the ONE joining rule shared by every prompt line that must
 *  enumerate a resource profile's kinds, so a future edit to the separator or
 *  the "or" placement cannot land in one line and miss the others. Every
 *  caller supplies its own per-kind formatting first (quoted code, or
 *  natural-language description) and hands the result here to be joined. */
export function oxfordJoin(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

/** "doc|video|tutorial" - the structuring call's JSON-schema kind
 *  alternation, built from `kinds` so it can never drift from what
 *  coerceResourceKind actually accepts. */
export function kindSchemaAlternation(kinds: readonly ResourceKind[]): string {
  return kinds.join("|");
}

/** `"doc", "video", or "tutorial"` - the structuring call's prose
 *  enumeration of the same list, same ordering, Oxford comma before the
 *  final "or", via oxfordJoin above. */
export function kindProseList(kinds: readonly ResourceKind[]): string {
  return oxfordJoin(kinds.map((k) => `"${k}"`));
}

/** A natural-language noun phrase per kind, for the prose call's description
 *  of what it is classifying - never a raw kind code, since that line reads
 *  as English, not JSON. Record<ResourceKind, string> so adding a sixth kind
 *  to the leaf without a phrase here is a compile error, not a silent gap. */
export const KIND_DESCRIPTION: Record<ResourceKind, string> = {
  doc: "official documentation",
  video: "a video tutorial",
  tutorial: "a written tutorial",
  news: "a news article",
  paper: "a paper",
};

/** "official documentation, a video tutorial, or a written tutorial" - the
 *  research call's prose mention of the allowed kinds, built from the SAME
 *  oxfordJoin used by kindProseList, so every kind-list mention in the
 *  research and structuring prompts traces back to one joining rule and one
 *  source array (a resource profile's `kinds`) and cannot drift from each
 *  other. */
export function kindDescriptionList(kinds: readonly ResourceKind[]): string {
  return oxfordJoin(kinds.map((k) => KIND_DESCRIPTION[k]));
}

// A gate-passing URL can still render as a dead anchor. markdownLiteToHtml
// (src/lib/markdown-lite.ts) turns a survivor into `[title](url)` and reuses
// tokenizeInline's INLINE_LINK_RE (src/lib/docx-blocks.ts) to parse it back
// out. That regex's markdown-link branch captures the url as `[^\s)]+` - it
// stops at the FIRST literal ")" or whitespace character, greedy or not. A
// real, alive, corroborated url containing a balanced paren (Wikipedia's own
// ".../Critical_path_method_(project)" is a real page) or an internal space
// (which a real fetch silently percent-encodes before the request, so the
// reachability check sees a 200) truncates at that character, producing a
// dead link plus stray text. Percent-encoding those characters (and ONLY
// those - see below) makes the emitted url safe inside "[text](url)" syntax
// while resolving to the exact same resource (a server treats "%28"/"%29"/
// "%20" identically to the literal characters they encode).
export const RENDER_UNSAFE_URL_CHARS_RE = /[()\s]/g;

export function encodeUrlForRenderSafety(url: string): string {
  // Matches only a literal "(", ")", or whitespace character - never a "%",
  // so an already-percent-encoded sequence (e.g. a url that already reads
  // "%28") is never touched and never double-encoded.
  return url.replace(RENDER_UNSAFE_URL_CHARS_RE, (ch) => {
    if (ch === "(") return "%28";
    if (ch === ")") return "%29";
    return "%20";
  });
}

/** How many of a concept's resolved grounding sources are ever shown to the
 *  structuring call, or selectable via an item's "source" index (Y2's
 *  "SOURCES VISITED BY THE SEARCH" list). Bounds the prompt's size and the
 *  work a caller does to resolve them, independent of how many sources a
 *  single grounded call happened to return. */
export const MAX_VISITED_SOURCES_IN_PROMPT = 10;

/** A resolved source whose uri is longer than this is dropped before it ever
 *  reaches the prompt or the index a model can select - an oversized uri
 *  bloats the structuring prompt for no benefit (a model does not need to
 *  read a multi-kilobyte url to cite it). */
export const MAX_VISITED_SOURCE_URI_LENGTH = 512;

/**
 * Build the ONE bounded source list a concept's structuring call is allowed
 * to see and select from - the SAME array must back both the prompt
 * (sourcesVisitedBlock below) and the index lookup (parseResourceItems's own
 * `sourceUrls` parameter), so the model's "source": <n> and this array's
 * indices always agree on what n means. Drops any source whose uri is over
 * MAX_VISITED_SOURCE_URI_LENGTH characters, then caps to the first
 * MAX_VISITED_SOURCES_IN_PROMPT survivors - the result is a fresh array, so
 * its indices are always contiguous from 0 (never sparse), even when a
 * source in the middle of the original list was dropped for being
 * oversized.
 */
export function boundVisitedSources(sources: readonly Source[]): Source[] {
  return sources.filter((s) => s.uri.length <= MAX_VISITED_SOURCE_URI_LENGTH).slice(0, MAX_VISITED_SOURCES_IN_PROMPT);
}

/**
 * The numbered list appended to the structuring prompt when a concept's
 * bounded source list (boundVisitedSources above) is non-empty. 0-indexed to
 * match parseResourceItems's own `sourceUrls` indexing exactly. Empty
 * `visitedSources` (the common case before a concept's grounded call ever
 * hit a redirect-host source, or for a caller with no sources to begin with)
 * yields "" for both the notes-block addition and the schema's "source"
 * field, which is what keeps the WHOLE structuring prompt byte-identical to
 * a call that never had a source list - not just the notes section.
 */
export function sourcesVisitedBlock(visitedSources: readonly Source[]): string {
  if (visitedSources.length === 0) return "";
  const list = visitedSources.map((s, i) => `${i}. ${s.title || s.uri} - ${s.uri}`).join("\n");
  return `\n\nSOURCES VISITED BY THE SEARCH (numbered from 0):\n${list}\n\nWhen an item IS one of the pages listed above, set its "source" field to that page's number. When it is not, set "source" to null. Do not alter a URL you already wrote in your notes just because it also carries a source number.`;
}

/**
 * Parse the structuring call's {"items":[...]} JSON into candidate resource
 * items, capped at maxItems. Malformed or missing shape degrades to []
 * rather than throwing - a parse miss becomes an empty result the caller
 * treats as a failed attempt.
 *
 * `sourceUrls` is the same (already bounded - see boundVisitedSources) list
 * shown to the model as the "SOURCES VISITED BY THE SEARCH" list, 0-indexed.
 * When an item's own "source" field is a valid in-range integer, its
 * resolved URL REPLACES whatever url the model wrote for that item, BEFORE
 * sanitizeResourceUrl runs (so the resolved url gets the exact same cleanup a
 * model-typed url would). Anything else - "source" absent, null, out of
 * range, or not a number (including a numeral written as a string, e.g.
 * "0") - leaves the model's own url untouched. Empty by default, so a call
 * with no source list to begin with is unaffected.
 *
 * Every url is run through sanitizeResourceUrl (src/lib/urls.ts) FIRST, on
 * the raw model-supplied (or source-replaced) string, so its
 * trailing-punctuation and unmatched-bracket cleanup still sees the real
 * trailing characters - percent-encoding a trailing ")" before that check
 * would hide it from the exact heuristic designed to catch it. Only what
 * survives is then percent-encoded for render-safety (encodeUrlForRenderSafety
 * above). An item whose url does not survive sanitizeResourceUrl (empty, not
 * http(s)) is dropped outright, same as an item with no title.
 */
export function parseResourceItems(
  text: string,
  maxItems: number,
  sourceUrls: readonly string[] = []
): CandidateResourceItem[] {
  const jsonText = jsonObjectSlice(text);
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText) as { items?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((raw) => {
        const sourceIndex = raw.source;
        const resolvedFromSource =
          typeof sourceIndex === "number" &&
          Number.isInteger(sourceIndex) &&
          sourceIndex >= 0 &&
          sourceIndex < sourceUrls.length
            ? sourceUrls[sourceIndex]
            : undefined;
        const sanitizedUrl = sanitizeResourceUrl(resolvedFromSource ?? String(raw.url ?? ""));
        return {
          title: String(raw.title ?? "").trim(),
          url: sanitizedUrl ? encodeUrlForRenderSafety(sanitizedUrl) : "",
          kind: coerceResourceKind(raw.kind),
          whatYouGet: String(raw.whatYouGet ?? "").trim(),
        };
      })
      .filter((item) => item.title.length > 0 && item.url.length > 0)
      .slice(0, maxItems);
  } catch {
    return [];
  }
}
