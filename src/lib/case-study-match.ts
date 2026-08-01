/**
 * Z1 (Group Z): the generic "best matching curated case-study entry" scorer,
 * shared by the APPLIED case-study library (src/lib/case-study-library.ts,
 * APPLIED_CASE_STUDIES) and the CODING case-study bank
 * (src/lib/research/case-studies.ts, CASE_STUDIES) - same mechanism, same
 * guarantees (whole-word topic matching, one anchor case per week, an
 * excludable id so a curated entry is never claimed by two different weeks)
 * for both course kinds, rather than two independently-written matchers that
 * could quietly drift apart.
 *
 * Pure: no I/O, no Date, no randomness.
 */

export interface TopicTaggedEntry {
  id: string;
  /** Keyword/topic tags used for matching against a week's topic + summary. */
  topics: string[];
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase();
}

function wholeWordMatch(term: string, normalizedText: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedText);
}

/**
 * The best-matching entry for a week's topic + summary, or null when nothing
 * matches (or every candidate is excluded). `exclude` holds entry ids already
 * claimed by another week in this same run, so the same curated case is
 * never assigned to two different weeks. Scored by how many of an entry's
 * topic tags whole-word-match the week's text; ties keep the library's own
 * declared order (earlier entries win).
 */
export function matchBestByTopics<T extends TopicTaggedEntry>(
  library: readonly T[],
  topic: string,
  summary: string,
  exclude: ReadonlySet<string> = new Set()
): T | null {
  const text = normalizeForMatch(`${topic} ${summary}`);
  if (!text.trim()) return null;

  let best: { entry: T; score: number } | null = null;
  for (const entry of library) {
    if (exclude.has(entry.id)) continue;
    const score = entry.topics.filter((tag) => wholeWordMatch(tag, text)).length;
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  return best?.entry ?? null;
}
