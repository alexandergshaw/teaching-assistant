/**
 * Shared relevance scorer for the research library, used identically for
 * in-repo entries and database rows so both layers rank the same way.
 */

export interface ScorableFields {
  /** Topic tags (matched with triple weight). */
  topics: string[];
  /** Title/organization/language text (matched with single weight). */
  haystack: string;
}

/**
 * Score fields against the query terms: topic-tag matches count triple,
 * haystack matches count single. A tag matches when it contains the term
 * ("for loop" matches "loop") or when the term is a plural-ish form of the tag
 * (the term starts with the tag and extends it by at most two characters, so
 * "loops" matches the tag "loop" but "selection" does not match "select").
 * Tags shorter than four characters ("c", "sql", "dns") require an exact term
 * match so they never match by accident inside longer words.
 */
export function scoreFields(fields: ScorableFields, terms: string[]): number {
  const topicsLower = fields.topics.map((t) => t.toLowerCase());
  const haystackLower = fields.haystack.toLowerCase();

  let score = 0;
  for (const term of terms) {
    const topicHit = topicsLower.some((topic) => {
      if (topic.length < 4) return topic === term;
      if (topic.includes(term)) return true;
      return term.startsWith(topic) && term.length - topic.length <= 2;
    });
    if (topicHit) {
      score += 3;
    }
    if (haystackLower.includes(term)) {
      score += 1;
    }
  }
  return score;
}
