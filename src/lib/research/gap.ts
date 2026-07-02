/**
 * Knowledge-gap measurement and the research loop.
 *
 * measureCoverage() scores how well the stored knowledge base covers a
 * requested topic: the fraction of the topic's significant terms with at least
 * one matching entry (term coverage, weighted 0.6) blended with how many
 * entries match at all versus a desired depth (weighted 0.4). The gap is
 * 1 - coverage.
 *
 * When the gap exceeds the configured threshold, runResearchLoop() retrieves
 * external knowledge (Wikipedia, Stack Overflow) for the topic and its
 * uncovered terms, stores it in the knowledge base as unverified entries with
 * full provenance, re-measures, and repeats up to a bounded number of rounds or
 * until the gap closes. Nothing here throws: with no database or no network the
 * loop simply reports that it stored nothing.
 */

import { significantWords } from "@/lib/embedded/scaffold";
import { scoreFields } from "./scoring";
import { searchKnowledgeRows, upsertKnowledge, type KnowledgeInsert, type KnowledgeRow } from "./db";
import { searchWikipedia, searchStackExchange, type ExternalResult } from "./external";

/** How many matching entries count as "deep enough" coverage of a topic. */
const DESIRED_DEPTH = 5;
const TERM_WEIGHT = 0.6;
const DEPTH_WEIGHT = 0.4;

const MAX_ROUNDS = 2;
/** How many uncovered terms are researched individually per round. */
const QUERIES_PER_ROUND = 2;
const RESULTS_PER_QUERY = 2;

export interface CoverageReport {
  /** 0..1 — how well the knowledge base covers the topic. */
  coverage: number;
  /** 0..1 — the knowledge gap (1 - coverage). */
  gap: number;
  /** Fraction of the topic's terms with at least one matching entry. */
  termCoverage: number;
  /** Matching entries relative to the desired depth, capped at 1. */
  depth: number;
  /** Total entries matching the topic. */
  matches: number;
  /** Topic terms with no matching entry (what the loop researches). */
  uncoveredTerms: string[];
}

/** The gap threshold above which the research loop kicks off (default 0.5). */
export function gapThreshold(): number {
  const raw = Number(process.env.KNOWLEDGE_GAP_THRESHOLD);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.5;
}

function rowMatchesTerm(row: KnowledgeRow, term: string): boolean {
  return (
    scoreFields(
      { topics: row.topics, haystack: `${row.title} ${row.organization ?? ""} ${row.language ?? ""}` },
      [term]
    ) > 0
  );
}

/** Measure how well the stored knowledge base covers the requested topic. */
export async function measureCoverage(topic: string): Promise<CoverageReport> {
  const terms = significantWords(topic, 3);
  if (terms.length === 0) {
    // Nothing measurable to cover; treat as fully covered so no loop runs.
    return { coverage: 1, gap: 0, termCoverage: 1, depth: 1, matches: 0, uncoveredTerms: [] };
  }

  const rows = (await searchKnowledgeRows(topic, { limit: 20 })) ?? [];
  const uncoveredTerms = terms.filter((term) => !rows.some((row) => rowMatchesTerm(row, term)));

  const termCoverage = (terms.length - uncoveredTerms.length) / terms.length;
  const depth = Math.min(1, rows.length / DESIRED_DEPTH);
  const coverage = TERM_WEIGHT * termCoverage + DEPTH_WEIGHT * depth;

  return {
    coverage,
    gap: 1 - coverage,
    termCoverage,
    depth,
    matches: rows.length,
    uncoveredTerms,
  };
}

// ── Storing retrieved knowledge ──────────────────────────────────────────────

/** Topic tags for a stored external entry: terms of the request plus its title. */
function tagsFor(topic: string, title: string): string[] {
  return significantWords(`${topic} ${title}`, 3).slice(0, 8);
}

function externalToInsert(result: ExternalResult, topic: string): KnowledgeInsert {
  return {
    id: result.id,
    kind: result.source === "wikipedia" ? "case_study" : "practice_problem",
    source: result.source,
    title: result.title,
    topics: tagsFor(topic, result.title),
    summary: result.summary,
    url: result.url,
    verified: false,
  };
}

export interface ResearchLoopReport {
  /** Coverage before the loop started. */
  before: CoverageReport;
  /** Coverage after the last round (equals `before` when no round ran). */
  after: CoverageReport;
  /** Whether the loop ran at all. */
  loopRan: boolean;
  /** Rounds actually executed. */
  rounds: number;
  /** Knowledge entries stored across all rounds. */
  stored: number;
}

/**
 * Retrieve and store external knowledge for a topic until the gap closes or
 * the round budget is spent. Each round researches the topic itself plus the
 * currently uncovered terms, stores everything found (unverified, with
 * provenance), and re-measures.
 */
export async function runResearchLoop(topic: string, before: CoverageReport): Promise<ResearchLoopReport> {
  let current = before;
  let stored = 0;
  let rounds = 0;

  for (let round = 0; round < MAX_ROUNDS && current.gap > gapThreshold(); round += 1) {
    rounds += 1;
    const queries = [topic, ...current.uncoveredTerms.slice(0, QUERIES_PER_ROUND)];

    const batches = await Promise.all(
      queries.map(async (query) => {
        const [wiki, stack] = await Promise.all([
          searchWikipedia(query, RESULTS_PER_QUERY),
          searchStackExchange(query, RESULTS_PER_QUERY),
        ]);
        return [...wiki, ...stack];
      })
    );

    const rows = new Map<string, KnowledgeInsert>();
    for (const result of batches.flat()) {
      rows.set(result.id, externalToInsert(result, topic));
    }
    if (rows.size === 0) break; // network yielded nothing; more rounds won't help

    stored += await upsertKnowledge([...rows.values()]);
    current = await measureCoverage(topic);
  }

  return { before, after: current, loopRan: rounds > 0, rounds, stored };
}

/**
 * The entry point the research API uses: measure the gap between what the app
 * knows and the requested topic, and when it exceeds the threshold, run the
 * research loop to retrieve and store more knowledge before answering.
 */
export async function ensureTopicKnowledge(topic: string): Promise<ResearchLoopReport> {
  const before = await measureCoverage(topic);
  if (before.gap <= gapThreshold()) {
    return { before, after: before, loopRan: false, rounds: 0, stored: 0 };
  }
  return runResearchLoop(topic, before);
}
