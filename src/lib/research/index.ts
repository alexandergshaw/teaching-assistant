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
import { scoreFields } from "./scoring";
import { searchKnowledgeRows, rowToCaseStudy, rowToPracticeProblem, type KnowledgeRow } from "./db";

export type { CaseStudyEntry } from "./case-studies";
export type { PracticeProblemEntry } from "./practice-problems";
export type { ExternalResult } from "./external";

export type KnowledgeEntry = CaseStudyEntry | PracticeProblemEntry;
export type KnowledgeKind = KnowledgeEntry["kind"] | "reference";
export type ResearchSource = "wikipedia" | "stackexchange" | "curated" | "manual";

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
  /** Restrict results to one kind; every kind is searched when omitted. */
  kind?: KnowledgeKind;
  /** Maximum results (default 3). */
  limit?: number;
}

const ALL_ENTRIES: KnowledgeEntry[] = [...CASE_STUDIES, ...PRACTICE_PROBLEMS];

/**
 * Retrieve the most relevant in-repo curated entries for a topic. Only entries
 * with a positive match score are returned — an off-topic query returns an
 * empty list rather than padding with unrelated material. Deterministic: ties
 * break by id. This is the offline fallback behind the database-backed search.
 */
function searchCurated(topic: string, options: ResearchOptions = {}): KnowledgeEntry[] {
  const limit = Math.max(1, Math.min(options.limit ?? 3, 20));
  const terms = significantWords(topic, 3);
  if (terms.length === 0) return [];

  const pool =
    options.kind && options.kind !== "reference"
      ? ALL_ENTRIES.filter((e) => e.kind === options.kind)
      : options.kind === "reference"
        ? []
        : ALL_ENTRIES;

  return pool
    .map((entry) => ({
      entry,
      score: scoreFields(
        {
          topics: entry.topics,
          haystack: `${entry.title} ${entry.kind === "case_study" ? entry.organization : entry.language}`,
        },
        terms
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map((item) => item.entry);
}

function rowToResult(row: KnowledgeRow): ResearchResult {
  const entry = rowToCaseStudy(row) ?? rowToPracticeProblem(row) ?? undefined;
  return {
    kind: row.kind,
    source: row.source,
    id: row.id,
    title: row.title,
    summary: row.summary.replace(/\n/g, " "),
    ...(row.url ? { url: row.url } : {}),
    ...(entry ? { entry } : {}),
  };
}

/**
 * Search the stored knowledge base (database-first). When the database is
 * unavailable or has no match, the in-repo curated entries answer instead, so
 * this always resolves and never throws.
 */
async function searchKnowledgeBase(topic: string, options: ResearchOptions = {}): Promise<ResearchResult[]> {
  const rows = await searchKnowledgeRows(topic, {
    kind: options.kind as KnowledgeRow["kind"] | undefined,
    limit: options.limit,
  });
  if (rows && rows.length > 0) {
    return rows.map(rowToResult);
  }
  return searchCurated(topic, options).map(curatedToResult);
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

  // Stored knowledge supplements the external results (and fully replaces them
  // when the network yields nothing). Dedupe on id and normalized title so a
  // stored copy of an external page does not repeat the live result.
  const seenTitles = new Set(external.map((r) => r.title.toLowerCase()));
  const seenIds = new Set(external.map((r) => r.id));
  const stored = (await searchKnowledgeBase(topic, options)).filter(
    (r) => !seenTitles.has(r.title.toLowerCase()) && !seenIds.has(r.id)
  );

  return [...external, ...stored].slice(0, limit);
}

/**
 * The most relevant case studies for a topic, database-first: the stored
 * knowledge base answers when reachable (so decks benefit from everything the
 * research loop has learned), the in-repo curated entries otherwise. Only rows
 * with the full case-study shape are returned. No external web calls.
 */
export async function findCaseStudies(topic: string, limit = 1): Promise<CaseStudyEntry[]> {
  const rows = await searchKnowledgeRows(topic, { kind: "case_study", limit: limit + 4 });
  if (rows) {
    const mapped = rows
      .map(rowToCaseStudy)
      .filter((entry): entry is CaseStudyEntry => entry !== null)
      .slice(0, limit);
    if (mapped.length > 0) return mapped;
  }
  return searchCurated(topic, { kind: "case_study", limit }) as CaseStudyEntry[];
}

/**
 * The most relevant practice problems for a topic, database-first with the
 * in-repo curated entries as fallback. Only verified rows with the complete
 * example/prompt/solution triple are returned, so Practice/Answer material is
 * always hand-checked. No external web calls.
 */
export async function findPracticeProblems(topic: string, limit = 1): Promise<PracticeProblemEntry[]> {
  const rows = await searchKnowledgeRows(topic, { kind: "practice_problem", limit: limit + 4 });
  if (rows) {
    const mapped = rows
      .map(rowToPracticeProblem)
      .filter((entry): entry is PracticeProblemEntry => entry !== null)
      .slice(0, limit);
    if (mapped.length > 0) return mapped;
  }
  return searchCurated(topic, { kind: "practice_problem", limit }) as PracticeProblemEntry[];
}
