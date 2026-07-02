/**
 * Database layer for the research library's knowledge base. The
 * knowledge_entries table is the system of record: it is seeded lazily (and
 * idempotently) from the in-repo curated entries, grows over time as the
 * research loop stores retrieved knowledge, and is searched with a
 * recall-oriented full-text prefilter in SQL followed by the shared strict
 * scorer in-process.
 *
 * Every function here degrades gracefully: when the Supabase configuration is
 * absent (tests, local builds) or any query fails, reads return null so callers
 * fall back to the in-repo entries, and writes report zero rows stored. Nothing
 * throws.
 */

import type { Database } from "@/lib/supabase/types";
import { significantWords } from "@/lib/embedded/scaffold";
import { scoreFields } from "./scoring";
import { CASE_STUDIES, type CaseStudyEntry } from "./case-studies";
import { PRACTICE_PROBLEMS, type PracticeProblemEntry } from "./practice-problems";

export type KnowledgeRow = Database["public"]["Tables"]["knowledge_entries"]["Row"];
export type KnowledgeInsert = Database["public"]["Tables"]["knowledge_entries"]["Insert"];

// Type-only import: matches exactly what createServiceClient returns without
// pulling the module (and next/headers) in at load time.
type ServiceClient = ReturnType<typeof import("@/lib/supabase/server").createServiceClient>;

/**
 * Typed access to the knowledge_entries table. The hand-maintained Database
 * type lacks the Relationships metadata supabase-js 2.10x wants, so table
 * inference degrades to never; the codebase convention (see chat-logs.ts,
 * accessibility.ts) is to cast at the from() boundary and keep row types
 * explicit on our side.
 */
interface KnowledgeTable {
  select(columns: string, options?: { count: "exact"; head: boolean }): KnowledgeQuery;
  upsert(rows: KnowledgeInsert[], options: { onConflict: string }): Promise<{ error: unknown }>;
  update(values: Record<string, unknown>): { eq(column: string, value: string): Promise<{ error: unknown }> };
  delete(): { eq(column: string, value: string): Promise<{ error: unknown }> };
}

interface KnowledgeQuery extends Promise<{ data: KnowledgeRow[] | null; error: unknown; count?: number | null }> {
  eq(column: string, value: string | number | boolean): KnowledgeQuery;
  textSearch(column: string, query: string): KnowledgeQuery;
  order(column: string, options: { ascending: boolean }): KnowledgeQuery;
  limit(n: number): KnowledgeQuery;
}

function knowledgeTable(client: ServiceClient): KnowledgeTable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).from("knowledge_entries") as KnowledgeTable;
}

// The service client is created once per process, lazily, and only when the
// environment is configured. The dynamic import keeps next/headers (pulled in
// by the supabase server module) out of non-Next contexts such as vitest.
let clientPromise: Promise<ServiceClient | null> | null = null;

function getClient(): Promise<ServiceClient | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Promise.resolve(null);
  }
  if (!clientPromise) {
    clientPromise = import("@/lib/supabase/server")
      .then((mod) => mod.createServiceClient())
      .catch(() => null);
  }
  return clientPromise;
}

// ── Row mapping ──────────────────────────────────────────────────────────────

function caseStudyToRow(entry: CaseStudyEntry): KnowledgeInsert {
  return {
    id: entry.id,
    kind: "case_study",
    source: "curated",
    title: entry.title,
    topics: entry.topics,
    summary: entry.summary.join("\n"),
    lesson: entry.lesson,
    organization: entry.organization,
    year: entry.year,
    verified: true,
  };
}

function practiceProblemToRow(entry: PracticeProblemEntry): KnowledgeInsert {
  return {
    id: entry.id,
    kind: "practice_problem",
    source: "curated",
    title: entry.title,
    topics: entry.topics,
    summary: entry.prompt,
    language: entry.language,
    difficulty: entry.difficulty,
    prompt: entry.prompt,
    example_code: entry.exampleCode,
    solution_code: entry.solutionCode,
    verified: true,
  };
}

/** Map a row back to a typed case study; null when required fields are absent. */
export function rowToCaseStudy(row: KnowledgeRow): CaseStudyEntry | null {
  if (row.kind !== "case_study") return null;
  const summary = row.summary.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!row.organization || !row.year || !row.lesson || summary.length === 0) return null;
  return {
    kind: "case_study",
    id: row.id,
    title: row.title,
    year: row.year,
    organization: row.organization,
    topics: row.topics,
    summary,
    lesson: row.lesson,
  };
}

/**
 * Map a row back to a typed practice problem. Requires the full worked
 * example / prompt / solution triple AND human verification — unverified rows
 * must never supply code that gets presented to students as a correct answer.
 */
export function rowToPracticeProblem(row: KnowledgeRow): PracticeProblemEntry | null {
  if (row.kind !== "practice_problem" || !row.verified) return null;
  if (!row.prompt || !row.example_code || !row.solution_code || !row.language) return null;
  return {
    kind: "practice_problem",
    id: row.id,
    title: row.title,
    topics: row.topics,
    language: row.language,
    difficulty: row.difficulty === "intro" ? "intro" : "core",
    prompt: row.prompt,
    exampleCode: row.example_code,
    solutionCode: row.solution_code,
  };
}

// ── Seeding ──────────────────────────────────────────────────────────────────

let seeded = false;

/**
 * Seed the table with the in-repo curated entries when they are missing.
 * Idempotent (upsert on id) and lazy: runs once per process, before the first
 * search. A failure leaves the flag unset so a later call retries.
 */
export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const client = await getClient();
  if (!client) return;
  try {
    const { count, error } = await knowledgeTable(client)
      .select("id", { count: "exact", head: true })
      .eq("source", "curated");
    if (error) return;

    const curatedTotal = CASE_STUDIES.length + PRACTICE_PROBLEMS.length;
    if ((count ?? 0) < curatedTotal) {
      const rows: KnowledgeInsert[] = [
        ...CASE_STUDIES.map(caseStudyToRow),
        ...PRACTICE_PROBLEMS.map(practiceProblemToRow),
      ];
      const { error: upsertError } = await knowledgeTable(client).upsert(rows, { onConflict: "id" });
      if (upsertError) return;
    }
    seeded = true;
  } catch {
    // Table missing or connection failure — callers fall back to in-repo data.
  }
}

// ── Search and writes ────────────────────────────────────────────────────────

/**
 * Search the knowledge base. SQL does a recall-oriented full-text prefilter
 * (title + tags + summary, OR across terms); the shared strict scorer then
 * ranks the candidates in-process, verified entries winning ties. Returns null
 * when the database is unavailable so the caller falls back to in-repo data.
 */
export async function searchKnowledgeRows(
  topic: string,
  options: { kind?: KnowledgeRow["kind"]; limit?: number } = {}
): Promise<KnowledgeRow[] | null> {
  const limit = Math.max(1, Math.min(options.limit ?? 3, 20));
  const terms = significantWords(topic, 3);
  if (terms.length === 0) return [];

  const client = await getClient();
  if (!client) return null;

  try {
    await ensureSeeded();
    let query = knowledgeTable(client)
      .select("*")
      .textSearch("fts", terms.join(" | "))
      .limit(50);
    if (options.kind) query = query.eq("kind", options.kind);

    const { data, error } = await query;
    if (error || !data) return null;

    return data
      .map((row) => ({
        row,
        score: scoreFields(
          {
            topics: row.topics,
            haystack: `${row.title} ${row.organization ?? ""} ${row.language ?? ""}`,
          },
          terms
        ),
      }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.row.verified) - Number(a.row.verified) ||
          // Usage-informed ranking: entries that keep proving useful win ties.
          (b.row.times_served ?? 0) - (a.row.times_served ?? 0) ||
          a.row.id.localeCompare(b.row.id)
      )
      .slice(0, limit)
      .map((item) => item.row);
  } catch {
    return null;
  }
}

/** Upsert knowledge rows (id-keyed, so re-storing the same content is a no-op).
 *  Returns how many rows were written; zero when the database is unavailable. */
export async function upsertKnowledge(rows: KnowledgeInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  const client = await getClient();
  if (!client) return 0;
  try {
    await ensureSeeded();
    const { error } = await knowledgeTable(client).upsert(rows, { onConflict: "id" });
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}

/** Count knowledge rows matching a term set; null when the DB is unavailable. */
export async function countKnowledgeMatches(topic: string): Promise<number | null> {
  const rows = await searchKnowledgeRows(topic, { limit: 20 });
  return rows === null ? null : rows.length;
}

/** Whether the knowledge store is configured (learning has somewhere to write). */
export async function isKnowledgeStoreAvailable(): Promise<boolean> {
  return (await getClient()) !== null;
}

/**
 * Record that entries were actually served into a deck, example set, or API
 * response (atomic increment via the bump_knowledge_served SQL function).
 * Fire-and-forget by design: failures are swallowed and nothing blocks on it.
 */
export async function recordServed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = await getClient();
  if (!client) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).rpc("bump_knowledge_served", { entry_ids: ids });
  } catch {
    // Usage tracking must never affect the caller.
  }
}

/** The shared service client (null when unconfigured) for sibling data layers. */
export function getDbClient(): Promise<ServiceClient | null> {
  return getClient();
}

// ── Owner curation ───────────────────────────────────────────────────────────

/** Unverified entries awaiting review, newest first; null when the database is
 *  unavailable. These are what the research loop has learned but no human has
 *  checked — the raw material for promotion to deck-grade knowledge. */
export async function listUnverifiedKnowledge(limit = 100): Promise<KnowledgeRow[] | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    await ensureSeeded();
    const { data, error } = await knowledgeTable(client)
      .select("*")
      .eq("verified", false)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export interface KnowledgeReviewEdits {
  /** The lesson connection a case study needs to become deck-grade. */
  lesson?: string;
  organization?: string;
  year?: number;
}

/** Promote an entry to verified, applying the reviewer's edits. A case study
 *  becomes deck-grade once it carries organization, year, and a lesson. */
export async function verifyKnowledgeEntry(id: string, edits: KnowledgeReviewEdits = {}): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    const values: Record<string, unknown> = { verified: true, updated_at: new Date().toISOString() };
    if (edits.lesson?.trim()) values.lesson = edits.lesson.trim();
    if (edits.organization?.trim()) values.organization = edits.organization.trim();
    if (typeof edits.year === "number" && Number.isFinite(edits.year)) values.year = Math.floor(edits.year);
    const { error } = await knowledgeTable(client).update(values).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** Discard a learned entry the reviewer judged not worth keeping. */
export async function deleteKnowledgeEntry(id: string): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    const { error } = await knowledgeTable(client).delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
