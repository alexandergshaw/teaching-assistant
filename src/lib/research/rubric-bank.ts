/**
 * The rubric bank. Human-authored rubrics that pass through embedded grading
 * (pasted, uploaded, or Canvas-supplied) are remembered, keyed by a content
 * hash so the same rubric is stored once no matter how often it grades. When
 * the engine is asked to GENERATE a rubric for a topic it has already seen a
 * real rubric for, it returns the instructor's own rubric instead of falling
 * back to rule-based generation — the engine's rubric quality grows with use.
 *
 * Everything degrades gracefully: without a database, remembering stores
 * nothing and lookups return null, and nothing throws.
 */

import { createHash } from "node:crypto";
import { cleanText, significantWords } from "@/lib/embedded/scaffold";
import { scoreFields } from "./scoring";
import type { Database } from "@/lib/supabase/types";
import { getDbClient } from "./db";

type RubricRow = Database["public"]["Tables"]["rubric_bank"]["Row"];
type RubricInsert = Database["public"]["Tables"]["rubric_bank"]["Insert"];

/** A banked rubric must beat this relevance score (roughly two topic-tag
 *  matches) before it replaces generation — a weak match is worse than the
 *  rule-based rubric built from the actual instructions. */
const MIN_MATCH_SCORE = 6;

/** Stable content id for a rubric: hash of its whitespace-normalized text. */
export function rubricFingerprint(rubricText: string): string {
  return createHash("sha256").update(cleanText(rubricText).toLowerCase()).digest("hex");
}

// Same convention as db.ts: cast at the from() boundary, keep row types explicit.
interface RubricTable {
  upsert(
    rows: RubricInsert[],
    options: { onConflict: string; ignoreDuplicates: boolean }
  ): Promise<{ error: unknown }>;
  select(columns: string): {
    overlaps(
      column: string,
      values: string[]
    ): { limit(n: number): Promise<{ data: RubricRow[] | null; error: unknown }> };
  };
}

async function rubricTable(): Promise<RubricTable | null> {
  const client = await getDbClient();
  if (!client) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).from("rubric_bank") as RubricTable;
}

/**
 * Remember a human-supplied rubric together with the assignment topic it graded.
 * Idempotent by content hash; trivial inputs are skipped. Fire-and-forget safe.
 */
export async function rememberRubric(instructions: string, rubricText: string): Promise<number> {
  const rubric = rubricText.trim();
  const topicText = cleanText(instructions);
  if (rubric.length < 40 || !topicText) return 0;
  const topics = significantWords(topicText, 3).slice(0, 12);
  if (topics.length === 0) return 0;

  const table = await rubricTable();
  if (!table) return 0;
  try {
    const { error } = await table.upsert(
      [
        {
          id: rubricFingerprint(rubric),
          topics,
          instructions_excerpt: topicText.slice(0, 300),
          rubric_text: rubric,
        },
      ],
      { onConflict: "id", ignoreDuplicates: true }
    );
    return error ? 0 : 1;
  } catch {
    return 0;
  }
}

/**
 * Pick the best banked rubric for the given instructions, or null when none
 * matches strongly enough. Pure and exported for tests.
 */
export function pickBankedRubric(rows: RubricRow[], instructions: string): RubricRow | null {
  const terms = significantWords(instructions, 3);
  if (terms.length === 0) return null;

  let best: { row: RubricRow; score: number } | null = null;
  for (const row of rows) {
    const score = scoreFields({ topics: row.topics, haystack: row.instructions_excerpt }, terms);
    if (score < MIN_MATCH_SCORE) continue;
    if (!best || score > best.score || (score === best.score && row.id < best.row.id)) {
      best = { row, score };
    }
  }
  return best?.row ?? null;
}

/**
 * The instructor's own rubric for a matching topic, or null. Used by the
 * embedded rubric generator before falling back to rule-based generation.
 */
export async function findRubricForTopic(instructions: string): Promise<string | null> {
  const terms = significantWords(instructions, 3);
  if (terms.length === 0) return null;

  const table = await rubricTable();
  if (!table) return null;
  try {
    const { data, error } = await table.select("*").overlaps("topics", terms).limit(10);
    if (error || !data) return null;
    return pickBankedRubric(data, instructions)?.rubric_text ?? null;
  } catch {
    return null;
  }
}
