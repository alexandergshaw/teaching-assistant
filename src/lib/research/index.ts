/**
 * The research library: deterministic knowledge retrieval over a curated,
 * factual knowledge base. Where an LLM recalls case studies and composes
 * practice problems from its training data, this ranks vetted entries by
 * topic-term overlap and serves them verbatim — so every fact, event, and code
 * solution returned was authored and checked by hand, and the same query always
 * returns the same results.
 *
 * Used in-app to give the Embedded Deterministic Engine real case-study slides
 * and Practice/Answer material; exposed to other clients via POST /api/research.
 */

import { significantWords } from "@/lib/embedded/scaffold";
import { CASE_STUDIES, type CaseStudyEntry } from "./case-studies";
import { PRACTICE_PROBLEMS, type PracticeProblemEntry } from "./practice-problems";

export type { CaseStudyEntry } from "./case-studies";
export type { PracticeProblemEntry } from "./practice-problems";

export type KnowledgeEntry = CaseStudyEntry | PracticeProblemEntry;
export type KnowledgeKind = KnowledgeEntry["kind"];

export interface ResearchOptions {
  /** Restrict results to one kind; both kinds are searched when omitted. */
  kind?: KnowledgeKind;
  /** Maximum results (default 3). */
  limit?: number;
}

const ALL_ENTRIES: KnowledgeEntry[] = [...CASE_STUDIES, ...PRACTICE_PROBLEMS];

/**
 * Score one entry against the query terms: topic-tag matches count triple,
 * title/organization matches count single. A tag matches when it contains the
 * term ("for loop" matches "loop") or when the term is a plural-ish form of the
 * tag (the term starts with the tag and extends it by at most two characters,
 * so "loops" matches the tag "loop" but "selection" does not match "select").
 * Tags shorter than four characters ("c", "sql", "dns") require an exact term
 * match so they never match by accident inside longer words.
 */
function scoreEntry(entry: KnowledgeEntry, terms: string[]): number {
  const topicsLower = entry.topics.map((t) => t.toLowerCase());
  const titleLower =
    `${entry.title} ${entry.kind === "case_study" ? entry.organization : entry.language}`.toLowerCase();

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
    if (titleLower.includes(term)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Retrieve the most relevant knowledge entries for a topic. Only entries with a
 * positive match score are returned — an off-topic query returns an empty list
 * rather than padding with unrelated material. Deterministic: ties break by id.
 */
export function research(topic: string, options: ResearchOptions = {}): KnowledgeEntry[] {
  const limit = Math.max(1, Math.min(options.limit ?? 3, 20));
  const terms = significantWords(topic, 3);
  if (terms.length === 0) return [];

  const pool = options.kind ? ALL_ENTRIES.filter((e) => e.kind === options.kind) : ALL_ENTRIES;

  return pool
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map((item) => item.entry);
}

/** The most relevant case studies for a topic (empty when nothing matches). */
export function findCaseStudies(topic: string, limit = 1): CaseStudyEntry[] {
  return research(topic, { kind: "case_study", limit }) as CaseStudyEntry[];
}

/** The most relevant practice problems for a topic (empty when nothing matches). */
export function findPracticeProblems(topic: string, limit = 1): PracticeProblemEntry[] {
  return research(topic, { kind: "practice_problem", limit }) as PracticeProblemEntry[];
}
