/**
 * The accumulating instructor glossary. Definitions found in the instructor's
 * own course materials are persisted (first stored definition for a term wins),
 * so the engine can reuse explanations the instructor already wrote: future
 * decks fill definition bullets for concepts whose current source material has
 * none, and "what is X?" chat questions can be answered from the glossary when
 * the highlighted text does not define X.
 *
 * Everything degrades gracefully: with no database configured, remembering
 * stores nothing and lookups return empty, and nothing throws.
 */

import { significantWords, type Definition } from "@/lib/embedded/scaffold";
import { DEFINE_INTENT } from "@/lib/embedded/answer";
import type { Database } from "@/lib/supabase/types";
import { getDbClient } from "./db";

type GlossaryRow = Database["public"]["Tables"]["glossary_terms"]["Row"];
type GlossaryInsert = Database["public"]["Tables"]["glossary_terms"]["Insert"];

/** Canonical id for a term: lowercase, alphanumeric words joined by hyphens. */
export function slugifyTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Same convention as db.ts: the hand-maintained Database types lack the
// Relationships metadata supabase-js wants, so cast at the from() boundary.
interface GlossaryTable {
  upsert(
    rows: GlossaryInsert[],
    options: { onConflict: string; ignoreDuplicates: boolean }
  ): Promise<{ error: unknown }>;
  select(columns: string): {
    in(column: string, values: string[]): Promise<{ data: GlossaryRow[] | null; error: unknown }>;
  };
}

async function glossaryTable(): Promise<GlossaryTable | null> {
  const client = await getDbClient();
  if (!client) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).from("glossary_terms") as GlossaryTable;
}

/**
 * Persist definitions extracted from course materials. Idempotent and
 * first-wins: an already-stored term keeps its original definition, so a
 * term's meaning stays stable once learned. Returns how many rows were sent.
 */
export async function rememberDefinitions(definitions: Definition[]): Promise<number> {
  const seen = new Set<string>();
  const rows: GlossaryInsert[] = [];
  for (const def of definitions) {
    const id = slugifyTerm(def.term);
    if (!id || id.length < 3 || seen.has(id)) continue;
    if (def.definition.trim().length < 20) continue;
    seen.add(id);
    rows.push({ id, term: def.term.trim(), definition: def.definition.trim() });
  }
  if (rows.length === 0) return 0;

  const table = await glossaryTable();
  if (!table) return 0;
  try {
    const { error } = await table.upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}

/** Fetch glossary rows for the given candidate terms, keyed by slug. */
export async function lookupDefinitions(candidates: string[]): Promise<Map<string, GlossaryRow>> {
  const slugs = [...new Set(candidates.map(slugifyTerm).filter((s) => s.length >= 3))];
  const result = new Map<string, GlossaryRow>();
  if (slugs.length === 0) return result;

  const table = await glossaryTable();
  if (!table) return result;
  try {
    const { data, error } = await table.select("*").in("id", slugs);
    if (error || !data) return result;
    for (const row of data) result.set(row.id, row);
    return result;
  } catch {
    return result;
  }
}

/**
 * Resolve a stored definition for each phrase (a whole-phrase match first, then
 * the phrase's significant words in order). One database round trip for all
 * phrases. Returns a map of phrase -> definition text for the phrases found.
 */
export async function lookupDefinitionsForPhrases(phrases: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (phrases.length === 0) return out;

  const candidatesByPhrase = new Map<string, string[]>();
  for (const phrase of phrases) {
    candidatesByPhrase.set(phrase, [phrase, ...significantWords(phrase, 3)]);
  }
  const hits = await lookupDefinitions([...candidatesByPhrase.values()].flat());
  if (hits.size === 0) return out;

  for (const [phrase, candidates] of candidatesByPhrase) {
    for (const candidate of candidates) {
      const hit = hits.get(slugifyTerm(candidate));
      if (hit) {
        out.set(phrase, hit.definition);
        break;
      }
    }
  }
  return out;
}

/**
 * Answer a "what is X?" question from the accumulated glossary. Only fires on
 * a definition intent; returns null when the glossary has nothing, so callers
 * can keep their honest no-answer reply.
 */
export async function answerFromGlossary(question: string): Promise<string | null> {
  if (!DEFINE_INTENT.test(question)) return null;
  const terms = significantWords(question, 3);
  if (terms.length === 0) return null;
  const hits = await lookupDefinitions(terms);
  for (const term of terms) {
    const hit = hits.get(slugifyTerm(term));
    if (hit) return `${hit.definition} (From your course glossary.)`;
  }
  return null;
}
