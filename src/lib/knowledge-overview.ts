// Persistence for the institution knowledge overview (the AI summary and the
// Ask AI history on a "parent" knowledge page - the institution root, or any
// page that has descendants). See
// supabase/migrations/20261011000000_institution_knowledge_overview.sql for
// the two tables this reads and writes, and that migration's header comment
// for the scope_key design scopeKeyFor below mirrors exactly.
//
// Pattern B: every function takes an injected SupabaseClient<Database> as
// its first argument, and this module never imports "@/lib/supabase/server"
// or "next/headers" - mirrors src/lib/supabase/generated-artifacts.ts and
// src/lib/supabase/task-institution-instructions.ts. requireOwner() lives one
// layer up, in the "use server" action that calls into this module
// (src/app/actions/knowledge-overview.ts).
//
// Every query below selects "*" and maps the row through an explicitly typed
// mapper (mapScopeSummary / mapScopeQuestion) rather than trusting inference -
// a column-subset .select() resolves to `never` on some tables in this repo
// (see generated-artifacts.ts's own header comment for the mechanics). The
// one place a column subset IS needed here (the history prune's
// .select("id")) takes the same targeted eslint-disabled `any` cast at
// .from() that listInstitutionPageSummaries in src/lib/knowledge-base.ts
// already documents, with the real shape restored on the very next line.
//
// EVERY exported function normalizes `institution` (via normalizeInstitution,
// the single casing authority owned by src/lib/knowledge-base.ts) before it
// ever touches a query or a write. Skipping this on any single path is a live
// bug class: a summary saved under "mcc" would be invisible to a read for
// "MCC", and the panel would silently offer to generate a second summary for
// the same scope forever.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import { normalizeInstitution } from "./knowledge-base";
import { truncateWithMarker } from "./discussion-reply-prompt";

// ---------------------------------------------------------------------------
// Scope key
// ---------------------------------------------------------------------------

/**
 * The all-zero uuid sentinel a null scope_page_id collapses to. Safe as a
 * sentinel because institution_pages.id is always produced by
 * gen_random_uuid() or crypto.randomUUID() (see the app's page-creation
 * path), and neither can ever emit the nil uuid - see the migration's header
 * comment for the full reasoning. Exported so a test (or a future caller)
 * can assert against it without restating the literal.
 */
export const INSTITUTION_ROOT_SCOPE_KEY = "00000000-0000-0000-0000-000000000000";

/**
 * THE ONE PLACE a nullable scope becomes a total key. Every query in this
 * module filters with `.eq("scope_key", scopeKeyFor(scopePageId))` - there is
 * NO `.is()`-vs-`.eq()` branch anywhere below, deliberately: PostgREST's
 * `.eq("scope_page_id", null)` compiles to `= NULL`, which matches NOTHING in
 * SQL, so a branch that tried to read the institution-root scope with
 * `.is("scope_page_id", null)` while writing it through scope_key would
 * silently split reads and writes onto two different identities - the root
 * read would return null forever while every generate wrote a new row.
 * Mirrors the migration's own
 * `coalesce(scope_page_id, '00000000-...'::uuid)` expression exactly, so the
 * key this function computes and the key Postgres computes for the generated
 * column are always the same value for the same input.
 */
export function scopeKeyFor(scopePageId: string | null): string {
  return scopePageId ?? INSTITUTION_ROOT_SCOPE_KEY;
}

// ---------------------------------------------------------------------------
// Length clamps
// ---------------------------------------------------------------------------

// Enforced HERE, not by a database CHECK - see the migration's header
// comment for why a CHECK would be worse: it would discard an answer a model
// call was just paid for. truncateWithMarker (src/lib/discussion-reply-
// prompt.ts) does the actual word-boundary cut; every clamped value is
// marked " [truncated]" in the stored text itself, so the omission is stated
// in the data, not just logged.
export const MAX_SUMMARY_CHARS = 20000;
export const MAX_QUESTION_CHARS = 2000;
export const MAX_ANSWER_CHARS = 20000;

const TRUNCATION_MARKER = " [truncated]";

function clamp(text: string, max: number): string {
  return truncateWithMarker(text, max, TRUNCATION_MARKER);
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * One page considered when a summary or an answer was generated - the
 * fingerprint shape src/lib/knowledge-overview-stale.ts diffs against to
 * decide staleness (added/removed/changed-updatedAt), and also the record of
 * which pages actually made the context budget (`included`: a page can be in
 * scope and still be omitted when the budget overflows). Stored as jsonb on
 * both tables; see parseSourcePages below for how a malformed entry is
 * dropped rather than trusted.
 */
export interface SummarySourcePage {
  id: string;
  title: string;
  updatedAt: string;
  included: boolean;
}

/**
 * One page a Q&A answer cited. `title` is a SNAPSHOT taken at answer time
 * (see the migration's comment on institution_knowledge_questions.citations)
 * so a page renamed afterward still shows the name the answer actually
 * referred to - resolving `id` back to a LIVE page for a click-to-select
 * affordance is the UI's job, not this module's.
 */
export interface AnswerCitation {
  id: string;
  title: string;
}

export interface ScopeSummary {
  id: string;
  institution: string;
  scopePageId: string | null;
  summary: string;
  sourcePages: SummarySourcePage[];
  model: string | null;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScopeQuestion {
  id: string;
  institution: string;
  scopePageId: string | null;
  question: string;
  answer: string;
  citations: AnswerCitation[];
  sourcePages: SummarySourcePage[];
  grounded: boolean;
  model: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// jsonb narrowing - never a cast. A malformed entry (a hand-edited row, a
// future schema change written by an older deploy, a field of the wrong
// type) is DROPPED rather than trusted: a dropped entry degrades a citation
// list or a staleness fingerprint by one item; an `as SummarySourcePage[]`
// cast would instead crash whatever tries to render the first bad entry.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSourcePages(value: Json): SummarySourcePage[] {
  if (!Array.isArray(value)) return [];
  const pages: SummarySourcePage[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { id, title, updatedAt, included } = entry;
    if (typeof id !== "string" || typeof title !== "string") continue;
    if (typeof updatedAt !== "string" || typeof included !== "boolean") continue;
    pages.push({ id, title, updatedAt, included });
  }
  return pages;
}

function parseCitations(value: Json): AnswerCitation[] {
  if (!Array.isArray(value)) return [];
  const citations: AnswerCitation[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { id, title } = entry;
    if (typeof id !== "string" || typeof title !== "string") continue;
    citations.push({ id, title });
  }
  return citations;
}

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client (mirrors mapGeneratedArtifact in
// src/lib/supabase/generated-artifacts.ts and mapInstitutionPage in
// src/lib/knowledge-base.ts). scope_key is never mapped onto ScopeSummary -
// it is a write-time implementation detail (see scopeKeyFor above); the app
// type only ever needs the scopePageId it was derived from.
export function mapScopeSummary(
  row: Database["public"]["Tables"]["institution_knowledge_summaries"]["Row"]
): ScopeSummary {
  return {
    id: row.id,
    institution: row.institution,
    scopePageId: row.scope_page_id,
    summary: row.summary,
    sourcePages: parseSourcePages(row.source_pages),
    model: row.model,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapScopeQuestion(
  row: Database["public"]["Tables"]["institution_knowledge_questions"]["Row"]
): ScopeQuestion {
  return {
    id: row.id,
    institution: row.institution,
    scopePageId: row.scope_page_id,
    question: row.question,
    answer: row.answer,
    citations: parseCitations(row.citations),
    sourcePages: parseSourcePages(row.source_pages),
    grounded: row.grounded,
    model: row.model,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/**
 * Every summary this owner has recorded for one institution, across every
 * scope (the root and every subtree). Small per-institution row count (at
 * most one row per distinct scope ever generated), so this is one
 * unfiltered read - mirrors listGeneratedArtifactVersions's own reasoning
 * about its own per-scope row count.
 */
export async function listScopeSummaries(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string
): Promise<ScopeSummary[]> {
  const { data, error } = await supabase
    .from("institution_knowledge_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution));

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapScopeSummary);
}

/**
 * The one summary for a specific scope, or null when nothing has been
 * generated there yet. Filters on scope_key (via scopeKeyFor), never on
 * scope_page_id directly - see scopeKeyFor's own doc comment for why a
 * `.is()`-vs-`.eq()` branch would be a live bug.
 */
export async function getScopeSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string,
  scopePageId: string | null
): Promise<ScopeSummary | null> {
  const { data, error } = await supabase
    .from("institution_knowledge_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution))
    .eq("scope_key", scopeKeyFor(scopePageId))
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapScopeSummary(data) : null;
}

export interface UpsertScopeSummaryInput {
  institution: string;
  scopePageId: string | null;
  summary: string;
  sourcePages: SummarySourcePage[];
  model: string | null;
  /**
   * REQUIRED - this process's own clock (`new Date().toISOString()`), never
   * left to the column default. The migration's default exists only for a
   * hand-written row; mixing this process's clock with a database-defaulted
   * `now()` for the SAME summary is exactly the two-clocks bug the
   * fingerprint-diff staleness design (src/lib/knowledge-overview-stale.ts)
   * was built to avoid.
   */
  generatedAt: string;
}

/**
 * Replace (never append to) the one summary row for a scope. onConflict is
 * the exact three-column key the migration's unique index enforces -
 * "user_id,institution,scope_key" - so a regenerate for the SAME scope
 * always overwrites the same row rather than accumulating a second one.
 * scope_key itself is never part of the write payload: it is GENERATED by
 * Postgres from scope_page_id, and the Insert/Update types omitting it turns
 * "cannot insert into a generated column" from a runtime PostgREST
 * rejection into a compile error.
 */
export async function upsertScopeSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpsertScopeSummaryInput
): Promise<ScopeSummary> {
  const upsertRow: Database["public"]["Tables"]["institution_knowledge_summaries"]["Insert"] = {
    user_id: userId,
    institution: normalizeInstitution(input.institution),
    scope_page_id: input.scopePageId,
    summary: clamp(input.summary, MAX_SUMMARY_CHARS),
    source_pages: input.sourcePages as unknown as Json,
    model: input.model,
    generated_at: input.generatedAt,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("institution_knowledge_summaries")
    .upsert(upsertRow, { onConflict: "user_id,institution,scope_key" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapScopeSummary(data);
}

// ---------------------------------------------------------------------------
// Questions (Ask AI history)
// ---------------------------------------------------------------------------

/** History cap - see appendScopeQuestion's own doc comment for the prune
 * this feeds, and clearScopeQuestions for the "delete everything" path. */
export const MAX_SCOPE_QA_ENTRIES = 20;

/**
 * Q&A history for one scope, newest first, capped at `limit` (default
 * MAX_SCOPE_QA_ENTRIES - the same cap appendScopeQuestion prunes down to, so
 * a fresh list can never show more than a prune would ever leave behind).
 */
export async function listScopeQuestions(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string,
  scopePageId: string | null,
  limit: number = MAX_SCOPE_QA_ENTRIES
): Promise<ScopeQuestion[]> {
  const { data, error } = await supabase
    .from("institution_knowledge_questions")
    .select("*")
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution))
    .eq("scope_key", scopeKeyFor(scopePageId))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapScopeQuestion);
}

export interface AppendScopeQuestionInput {
  institution: string;
  scopePageId: string | null;
  question: string;
  answer: string;
  citations: AnswerCitation[];
  sourcePages: SummarySourcePage[];
  grounded: boolean;
  model: string | null;
}

/**
 * Append one Q&A entry, then prune this scope's history back down to
 * MAX_SCOPE_QA_ENTRIES, oldest first. The prune runs AFTER the insert (never
 * before, and never in the same statement) so the entry the instructor just
 * waited on is always saved even if the prune itself fails - and a prune
 * failure is logged and SWALLOWED, never thrown: losing the answer because
 * housekeeping broke would be strictly worse than a scope sitting one entry
 * over the cap until the next append tries again.
 */
export async function appendScopeQuestion(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AppendScopeQuestionInput
): Promise<ScopeQuestion> {
  const institution = normalizeInstitution(input.institution);

  const insertRow: Database["public"]["Tables"]["institution_knowledge_questions"]["Insert"] = {
    user_id: userId,
    institution,
    scope_page_id: input.scopePageId,
    question: clamp(input.question, MAX_QUESTION_CHARS),
    answer: clamp(input.answer, MAX_ANSWER_CHARS),
    citations: input.citations as unknown as Json,
    source_pages: input.sourcePages as unknown as Json,
    grounded: input.grounded,
    model: input.model,
  };

  const { data, error } = await supabase
    .from("institution_knowledge_questions")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const saved = mapScopeQuestion(data);

  try {
    // institution is already normalized above - pruneScopeQuestions is a
    // private helper called only from here, so it is not re-normalized.
    await pruneScopeQuestions(supabase, userId, institution, input.scopePageId);
  } catch (pruneError) {
    console.error("appendScopeQuestion: prune failed, history left over the cap", pruneError);
  }

  return saved;
}

/**
 * Delete every row for this scope beyond MAX_SCOPE_QA_ENTRIES, oldest first.
 * The id list needs a column-subset select (just "id"), which resolves to
 * `never` on this table the same way listInstitutionPageSummaries documents
 * (src/lib/knowledge-base.ts) - worked around the same way, with a targeted
 * `any` cast at `.from()` and the real shape restored on the very next line.
 * Not exported: the only caller is appendScopeQuestion, immediately above.
 */
async function pruneScopeQuestions(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string,
  scopePageId: string | null
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from("institution_knowledge_questions")
    .select("id")
    .eq("user_id", userId)
    .eq("institution", institution)
    .eq("scope_key", scopeKeyFor(scopePageId))
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const ids = ((rows ?? []) as { id: string }[]).map((row) => row.id);
  const overflow = ids.slice(MAX_SCOPE_QA_ENTRIES);
  if (overflow.length === 0) return;

  const { error: deleteError } = await supabase
    .from("institution_knowledge_questions")
    .delete()
    .in("id", overflow);

  if (deleteError) throw new Error(deleteError.message);
}

/** Delete one Q&A entry outright, owner-gated by user_id so a caller can
 * never delete a row it does not own by guessing an id. */
export async function deleteScopeQuestion(supabase: SupabaseClient<Database>, userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("institution_knowledge_questions")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * Delete every Q&A entry for one scope, returning the row count so the UI
 * can state the real blast radius before the instructor confirms (mirrors
 * countInstitutionPages in src/lib/knowledge-base.ts, which exists for the
 * same "say the real number before an irreversible action" reason). Uses a
 * head-only exact count (like countInstitutionPages) rather than fetching
 * and counting rows, so no column-subset cast is needed here - a head:true
 * count never reads `data`, so the `never`-collapse this module's header
 * comment describes never comes into play.
 */
export async function clearScopeQuestions(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string,
  scopePageId: string | null
): Promise<number> {
  const normalizedInstitution = normalizeInstitution(institution);
  const scopeKey = scopeKeyFor(scopePageId);

  const { count, error: countError } = await supabase
    .from("institution_knowledge_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("institution", normalizedInstitution)
    .eq("scope_key", scopeKey);

  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  if (total === 0) return 0;

  const { error } = await supabase
    .from("institution_knowledge_questions")
    .delete()
    .eq("user_id", userId)
    .eq("institution", normalizedInstitution)
    .eq("scope_key", scopeKey);

  if (error) throw new Error(error.message);
  return total;
}
