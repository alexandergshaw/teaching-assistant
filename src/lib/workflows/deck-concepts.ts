// Pure helpers for extracting teachable concepts from a lecture slide deck
// (src/app/actions/visualizer.ts's extractDeckConceptsAction, consumed by
// the "ensure-visualizer-pages-for-deck" step). Split into a plain module (no
// "use server") because a Server Actions file may only export async
// functions - these clamps/parsers are synchronous and unit-tested directly,
// mirroring src/lib/workflows/current-events-report.ts's pattern.
import { jsonObjectSlice } from "@/app/actions/shared";
import { normalizeConceptKey } from "@/lib/visualizer";

export interface DeckConcept {
  concept: string;
  evidence: string;
}

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Clamp a user-supplied maxConcepts value to [1, 20], defaulting to 8. */
export function clampDeckConcepts(raw: unknown): number {
  return clampInt(raw, 8, 1, 20);
}

/** Dedupe by normalizeConceptKey (keeping the first-seen entry) and drop
 * entries with an empty concept name. */
function dedupeConcepts(items: DeckConcept[]): DeckConcept[] {
  const seen = new Set<string>();
  const result: DeckConcept[] = [];
  for (const item of items) {
    if (!item.concept) continue;
    const key = normalizeConceptKey(item.concept);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * Parse the concept-extraction model's response into a deck concept list,
 * capped at `max`. Tries JSON
 * ({"concepts":[{"concept":"...","evidence":"..."}]}) first, then falls back
 * to treating each non-empty line as a concept (stripping "-"/"*"/"1."
 * prefixes, skipping lines over 120 chars). Dedupes by normalizeConceptKey.
 * Junk input (empty text, no parseable lines) returns [].
 */
export function parseDeckConcepts(text: string, max: number): DeckConcept[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const jsonText = jsonObjectSlice(trimmed);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as {
        concepts?: Array<{ concept?: unknown; evidence?: unknown }>;
      };
      if (Array.isArray(parsed.concepts)) {
        // Valid JSON with a real (if empty) concepts array is trusted as-is -
        // it is NOT junk, so it must not fall through to line-parsing, which
        // would otherwise re-read the raw JSON text itself as a single junk
        // "concept" line.
        const concepts = dedupeConcepts(
          parsed.concepts.map((c) => ({
            concept: String(c.concept ?? "").trim(),
            evidence: String(c.evidence ?? "").trim(),
          }))
        );
        return concepts.slice(0, max);
      }
    } catch {
      // Fall through to line parsing.
    }
  }

  const lines = trimmed
    .split("\n")
    .map((l) => l.replace(/^[\s*-]+/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter((l) => l.length > 0 && l.length <= 120);

  const fromLines = dedupeConcepts(lines.map((l) => ({ concept: l, evidence: "" })));
  return fromLines.slice(0, max);
}

/**
 * Deterministic embedded-provider fallback: extract concepts directly from a
 * deck's slide titles, no model call. Recognizes both deck renderings this
 * repo produces: markdown "## <title>" headings (buildCurrentEventsDocMarkdown-
 * style decks) and "Slide N: <title>" lines (extractPptxSlidesAction-style
 * decks, e.g. the current-events-report step's own deckText assembly).
 */
export function conceptsFromSlideTitles(deckText: string, max: number): DeckConcept[] {
  const trimmed = deckText.trim();
  if (!trimmed) return [];

  const titles: string[] = [];
  for (const line of trimmed.split("\n")) {
    const mdMatch = line.match(/^\s*##\s+(.+)$/);
    if (mdMatch) {
      titles.push(mdMatch[1].trim());
      continue;
    }
    const slideMatch = line.match(/^\s*Slide\s+\d+:\s*(.+)$/i);
    if (slideMatch) {
      titles.push(slideMatch[1].trim());
    }
  }

  const deduped = dedupeConcepts(titles.map((t) => ({ concept: t, evidence: t })));
  return deduped.slice(0, max);
}
