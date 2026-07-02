/**
 * The research library: returns the most useful knowledge for a topic area,
 * pulling primarily from external sources — Wikipedia for case studies and
 * background knowledge, Stack Overflow for the questions practitioners actually
 * hit — with the curated in-repo knowledge base filling the remaining slots and
 * serving as the offline fallback when external sources fail or return nothing.
 *
 * Two layers with different guarantees:
 * - research() (async): external-first, used by POST /api/research. Live
 *   results carry a source and URL; curated results carry the full vetted entry.
 * - findCaseStudies()/findPracticeProblems() (sync): curated-only, used by the
 *   Embedded Deterministic Engine, which promises no network calls and needs
 *   hand-verified code solutions for its Practice/Answer slides.
 */

import { significantWords } from "@/lib/embedded/scaffold";
import { CASE_STUDIES, type CaseStudyEntry } from "./case-studies";
import { PRACTICE_PROBLEMS, type PracticeProblemEntry } from "./practice-problems";
import { searchWikipedia, searchStackExchange, type ExternalResult } from "./external";

export type { CaseStudyEntry } from "./case-studies";
export type { PracticeProblemEntry } from "./practice-problems";
export type { ExternalResult } from "./external";

export type KnowledgeEntry = CaseStudyEntry | PracticeProblemEntry;
export type KnowledgeKind = KnowledgeEntry["kind"];
export type ResearchSource = "wikipedia" | "stackexchange" | "curated";

/** One normalized research result, whichever source produced it. */
export interface ResearchResult {
  kind: KnowledgeKind;
  source: ResearchSource;
  id: string;
  title: string;
  /** Prose summary: the page extract, question excerpt, or curated summary. */
  summary: string;
  /** Link to the external source; absent for curated entries. */
  url?: string;
  /** The full vetted entry (including verified code) for curated results. */
  entry?: KnowledgeEntry;
}

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
 * Retrieve the most relevant curated entries for a topic. Only entries with a
 * positive match score are returned — an off-topic query returns an empty list
 * rather than padding with unrelated material. Deterministic: ties break by id.
 */
function searchCurated(topic: string, options: ResearchOptions = {}): KnowledgeEntry[] {
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

function curatedToResult(entry: KnowledgeEntry): ResearchResult {
  return {
    kind: entry.kind,
    source: "curated",
    id: entry.id,
    title: entry.title,
    summary: entry.kind === "case_study" ? entry.summary.join(" ") : entry.prompt,
    entry,
  };
}

function externalToResult(result: ExternalResult, kind: KnowledgeKind): ResearchResult {
  return {
    kind,
    source: result.source,
    id: result.id,
    title: result.title,
    summary: result.summary,
    url: result.url,
  };
}

/** Alternate two lists (a0, b0, a1, b1, ...) so both kinds surface early. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/**
 * Retrieve the most useful knowledge for a topic, external sources first:
 * Wikipedia serves case studies / background knowledge, Stack Overflow serves
 * practice-problem material. Curated entries fill any remaining slots and take
 * over entirely when the external sources fail or return nothing, so the call
 * always succeeds and never throws.
 */
export async function research(topic: string, options: ResearchOptions = {}): Promise<ResearchResult[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 3, 20));
  const wantCaseStudies = !options.kind || options.kind === "case_study";
  const wantPracticeProblems = !options.kind || options.kind === "practice_problem";

  const [wiki, stack] = await Promise.all([
    wantCaseStudies ? searchWikipedia(topic, limit) : Promise.resolve([]),
    wantPracticeProblems ? searchStackExchange(topic, limit) : Promise.resolve([]),
  ]);

  const external = interleave(
    wiki.map((r) => externalToResult(r, "case_study")),
    stack.map((r) => externalToResult(r, "practice_problem"))
  );

  // Curated entries supplement the external results (and fully replace them
  // when the network yields nothing). Dedupe on normalized title so a curated
  // entry does not repeat an external page about the same thing.
  const seenTitles = new Set(external.map((r) => r.title.toLowerCase()));
  const curated = searchCurated(topic, options)
    .map(curatedToResult)
    .filter((r) => !seenTitles.has(r.title.toLowerCase()));

  return [...external, ...curated].slice(0, limit);
}

/** The most relevant curated case studies (sync, offline; used by the embedded engine). */
export function findCaseStudies(topic: string, limit = 1): CaseStudyEntry[] {
  return searchCurated(topic, { kind: "case_study", limit }) as CaseStudyEntry[];
}

/** The most relevant curated practice problems (sync, offline; used by the embedded engine). */
export function findPracticeProblems(topic: string, limit = 1): PracticeProblemEntry[] {
  return searchCurated(topic, { kind: "practice_problem", limit }) as PracticeProblemEntry[];
}
