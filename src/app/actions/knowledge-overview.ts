"use server";

// Server actions for the knowledge-overview feature (an AI-generated summary
// of a scope's pages, and an Ask AI question box grounded in the same
// scope) - the "parent knowledge page" feature described in the feature's
// acceptance criteria. Thin owner-scoped wrappers, mirroring the idiom
// src/app/actions/knowledge-base.ts already uses: requireOwner() +
// createServiceClient(), every path returning {error: string} instead of a
// raw exception or a Supabase failure.
//
// A7 - READ-ONLY BY CONSTRUCTION. This file imports NOTHING that can write a
// knowledge-base page (no deleteInstitutionPage, no updateInstitutionPage),
// declares no LLM tools, and calls generateContent (via callLlm) as a plain,
// single-shot text call. deleteInstitutionPage cascades an entire subtree, so
// the worst case of an instructor typing "delete my attendance policy" into
// the Ask AI box must be wrong WORDS in a stored answer, never a lost page -
// which only holds if the write capability is structurally absent here, not
// merely discouraged by a prompt instruction (the prompt, owned by Group B2,
// separately tells the model to refuse and explain it cannot act, but that
// is belt, not suspenders).
//
// This file is I/O (Supabase + an LLM call) with no vitest coverage
// (environment "node" over src/**/*.test.ts only - no route-handler
// harness), so correctness here rests on careful reading, not a green
// suite - see the comments below for the non-obvious calls.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  callLlm,
  describeLlmFailure,
  describeEmptyLlmText,
  DEFAULT_PROVIDER,
  type LlmProvider,
} from "@/lib/llm";
import { getGeminiModel } from "@/lib/gemini";
import { extractJsonObject } from "@/app/actions/shared";
import { normalizeInstitution } from "@/lib/knowledge-base";
import { resolveSummaryScopeContext, resolveQuestionScopeContext } from "@/lib/knowledge-scope-context";
import {
  getScopeSummary,
  upsertScopeSummary,
  listScopeQuestions,
  appendScopeQuestion,
  deleteScopeQuestion,
  clearScopeQuestions,
  type ScopeSummary,
  type ScopeQuestion,
  type SummarySourcePage,
  type AnswerCitation,
} from "@/lib/knowledge-overview";
import { buildOverviewSummaryTurns, buildOverviewAnswerTurns, resolvePageMarkers, answerLooksUngrounded } from "@/lib/knowledge-overview-prompt";

/**
 * Every scope page (not just the ones that made it into the generation
 * context), each flagged with whether it did - the fingerprint C2/AC3 needs
 * for staleness (added/removed/changed-updatedAt, computed client-side by
 * Group B1's summaryStaleness over this SAME shape) and the "included" flag
 * AC9's UI reads to say plainly which pages were omitted. A page dropped by
 * the id cap, a retrieval tier, or the char budget all read as
 * `included: false` here - the caller does not need to know WHICH of those
 * three excluded it to compute staleness correctly, only that it did not
 * contribute this time.
 */
function fingerprintSourcePages(
  scopePages: { id: string; title: string; updatedAt: string }[],
  includedIds: Set<string>
): SummarySourcePage[] {
  return scopePages.map((p) => ({
    id: p.id,
    title: p.title,
    updatedAt: p.updatedAt,
    included: includedIds.has(p.id),
  }));
}

/**
 * The model string to persist for display ("model" column - free text, no
 * CHECK constraint so a new model id can never fail a save). callLlm's
 * provider argument does not select a model (callGemini alone picks it, per
 * gemini.ts's GEMINI_MODEL env var) and every provider value currently
 * resolves to a real Gemini call underneath (callLlm's own comment: an
 * unmatched "other" provider "transparently falls back to Gemini"), so the
 * ACTUAL model that ran is always getGeminiModel(), regardless of the
 * nominal `provider` argument.
 */
function currentModelLabel(): string {
  return getGeminiModel();
}

// ---------------------------------------------------------------------------
// Read.
// ---------------------------------------------------------------------------

export async function getKnowledgeOverviewAction(
  institution: string,
  scopePageId: string | null
): Promise<{ summary: ScopeSummary | null; questions: ScopeQuestion[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const normalizedInstitution = normalizeInstitution(institution);
    // Staleness is deliberately NOT computed here (AC3's own design note):
    // it must run in the panel, at render, over the `pages` array the
    // Knowledge tab already holds client-side - computing it here would
    // freeze it in a value that goes stale itself the moment a page changes
    // without a reload. Group B1's summaryStaleness + collectScopePages are
    // plain exports the UI calls directly against this action's returned
    // `summary.sourcePages`.
    const [summary, questions] = await Promise.all([
      getScopeSummary(supabase, user.id, normalizedInstitution, scopePageId),
      listScopeQuestions(supabase, user.id, normalizedInstitution, scopePageId),
    ]);
    return { summary, questions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the knowledge overview." };
  }
}

// ---------------------------------------------------------------------------
// Generate the overview summary.
// ---------------------------------------------------------------------------

const SUMMARY_GENERATION_CONFIG = {
  // Advisory on the default model: normalizeGenerationConfig (llm.ts:91-97)
  // deletes any temperature below 1 for Gemini 3.x models (the default
  // gemini-3.1-flash-lite included) unless GEMINI_ALLOW_LOW_TEMPERATURE is
  // set. Kept for a non-Gemini-3 provider or a future GEMINI_MODEL switch -
  // the same disclosure discussion-replies.ts already writes (:337-339).
  temperature: 0.2,
  // Never below 2048: on Gemini 3.x, thinking tokens share this budget
  // (gemini.ts:168-173) and the previous 700 default would return empty.
  maxOutputTokens: 4096,
};

/** A page named by id + title only - the shape both X8's hardCappedPages
 * notice and the UI's consumer (src/app/components/knowledge/
 * useKnowledgeOverview.ts's TitledPageRef) need: enough to name a dropped
 * page without pretending to know anything else about it. */
export interface KnowledgeOverviewPageRef {
  id: string;
  title: string;
}

export interface GenerateKnowledgeOverviewSummaryResult {
  summary: ScopeSummary;
  /** X8: pages dropped by the 400-page-id cap - they never reached
   * buildKnowledgeContextBlock at all, so they carry no sourcePages entry
   * and would otherwise vanish silently while the summary claims to have
   * covered the whole scope. */
  hardCappedPages: KnowledgeOverviewPageRef[];
  /** Count of attachment files that could not be read, were over the
   * per-file download cap, or were beyond the per-turn attachment cap. */
  skippedAttachments: number;
}

export async function generateKnowledgeOverviewSummaryAction(
  institution: string,
  scopePageId: string | null,
  provider: LlmProvider = DEFAULT_PROVIDER
): Promise<GenerateKnowledgeOverviewSummaryResult | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const normalizedInstitution = normalizeInstitution(institution);

    const context = await resolveSummaryScopeContext(supabase, user.id, normalizedInstitution, scopePageId);
    if (context.scopePages.length === 0) {
      return { error: "There are no pages in scope to summarize." };
    }

    const turns = buildOverviewSummaryTurns({
      scopeLabel: context.scopeLabel,
      contextBlock: context.block,
      markedPages: context.includedPages,
    });

    const result = await callLlm({ contents: turns, generationConfig: SUMMARY_GENERATION_CONFIG }, provider);
    if (!result.ok) return { error: describeLlmFailure(result, "Generating the overview failed") };
    if (!result.text.trim()) return { error: describeEmptyLlmText(result, "Generating the overview") };

    // The raw text (including its trailing "SOURCE PAGES: P1; P3" sentinel -
    // see PROMPTS.md's summary prompt) is stored AS-IS: parsing that
    // sentinel into clickable citations (Group B2's parseSummarySourceMarkers)
    // is deliberately left to the read/render side, not done here, because
    // it is fully re-derivable at any later read from
    // `sourcePages.filter(p => p.included)` IN STORED ORDER - which is
    // exactly the same order markers were assigned in at generation time.
    // Computing and discarding it here would just be wasted work on every
    // generation whose result is never immediately re-rendered.
    const summaryText = result.text.trim();
    const includedIds = new Set(context.includedPages.map((p) => p.id));
    const sourcePages = fingerprintSourcePages(context.scopePages, includedIds);

    const summary = await upsertScopeSummary(supabase, user.id, {
      institution: normalizedInstitution,
      scopePageId,
      summary: summaryText,
      sourcePages,
      model: currentModelLabel(),
      generatedAt: new Date().toISOString(),
    });

    return {
      summary,
      hardCappedPages: context.hardCappedPages,
      skippedAttachments: context.skippedAttachments.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the knowledge overview." };
  }
}

// ---------------------------------------------------------------------------
// Ask AI.
// ---------------------------------------------------------------------------

const ANSWER_GENERATION_CONFIG = {
  temperature: 0.2,
  maxOutputTokens: 2048,
  // Passes through normalizeGenerationConfig untouched (llm.ts:89, pinned by
  // llm.test.ts:431-437) and is already used at six existing call sites.
  responseMimeType: "application/json",
};

export interface AskKnowledgeOverviewResult {
  question: ScopeQuestion;
  /** True only on the MANDATORY JSON-parse-failure fallback (PROMPTS.md /
   * addendum A4): the envelope did not parse, the raw text was stored as the
   * answer with no citations. Never surfaced as an error - "could not parse"
   * must never reach the instructor - but the UI needs this to caption the
   * answer honestly ("citations unavailable for this answer") instead of
   * silently presenting an uncited answer as cited. */
  citationsUnavailable: boolean;
  /** X8: pages dropped by the 400-page-id cap - see the matching field on
   * GenerateKnowledgeOverviewSummaryResult above. */
  hardCappedPages: KnowledgeOverviewPageRef[];
  /** Count of attachment files that could not be read, were over the
   * per-file download cap, or were beyond the per-turn attachment cap. */
  skippedAttachments: number;
}

export async function askKnowledgeOverviewAction(
  institution: string,
  scopePageId: string | null,
  question: string,
  provider: LlmProvider = DEFAULT_PROVIDER
): Promise<AskKnowledgeOverviewResult | { error: string }> {
  try {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return { error: "Type a question first." };

    const user = await requireOwner();
    const supabase = createServiceClient();
    const normalizedInstitution = normalizeInstitution(institution);

    const context = await resolveQuestionScopeContext(
      supabase,
      user.id,
      normalizedInstitution,
      scopePageId,
      trimmedQuestion,
      provider
    );
    if (context.scopePages.length === 0) {
      return { error: "There are no pages in scope to search." };
    }

    const turns = buildOverviewAnswerTurns({
      scopeLabel: context.scopeLabel,
      contextBlock: context.block,
      markedPages: context.includedPages,
      question: trimmedQuestion,
    });

    const result = await callLlm({ contents: turns, generationConfig: ANSWER_GENERATION_CONFIG }, provider);
    if (!result.ok) return { error: describeLlmFailure(result, "Asking the knowledge base failed") };
    if (!result.text.trim()) return { error: describeEmptyLlmText(result, "Asking the knowledge base") };

    let answer: string;
    let citations: AnswerCitation[];
    let grounded: boolean;
    let citationsUnavailable = false;

    const envelope = extractJsonObject(result.text);
    if (envelope && typeof envelope.answer === "string") {
      answer = envelope.answer;
      const markers = Array.isArray(envelope.citedPageMarkers)
        ? envelope.citedPageMarkers.filter((m): m is string => typeof m === "string")
        : [];
      // Markers resolve BY INDEX against the pages actually fed to the
      // model (context.includedPages) - never by title (R5): a marker
      // outside 1..n, or pointing at a page the budget/tier excluded, is
      // dropped rather than guessed.
      citations = resolvePageMarkers(markers, context.includedPages);
      // "grounded" is the model's OWN stated fact (answeredFromPages) -
      // persisted as-is, never re-derived by string-matching the answer
      // (the data layer's own schema note on the `grounded` column).
      // answerLooksUngrounded is reserved for the fallback branch below,
      // where there is no explicit signal any other way.
      grounded = envelope.answeredFromPages === true;
    } else {
      // MANDATORY FALLBACK (PROMPTS.md / addendum A4): the envelope did not
      // parse - extractJsonObject returns null when jsonObjectSlice (first
      // "{" to LAST "}") cannot find a balanced object, which is exactly
      // what a maxOutputTokens-truncated response looks like (no closing
      // brace). Treat the raw text as the answer, citations empty, and flag
      // it - NEVER surface "could not parse" to the instructor.
      answer = result.text.trim();
      citations = [];
      grounded = !answerLooksUngrounded(answer);
      citationsUnavailable = true;
    }

    const includedIds = new Set(context.includedPages.map((p) => p.id));
    const sourcePages = fingerprintSourcePages(context.scopePages, includedIds);

    const savedQuestion = await appendScopeQuestion(supabase, user.id, {
      institution: normalizedInstitution,
      scopePageId,
      question: trimmedQuestion,
      answer,
      citations,
      sourcePages,
      grounded,
      model: currentModelLabel(),
    });

    return {
      question: savedQuestion,
      citationsUnavailable,
      hardCappedPages: context.hardCappedPages,
      skippedAttachments: context.skippedAttachments.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not answer the question." };
  }
}

// ---------------------------------------------------------------------------
// History management.
// ---------------------------------------------------------------------------

export async function deleteKnowledgeOverviewQaAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await deleteScopeQuestion(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete that question." };
  }
}

export async function clearKnowledgeOverviewQaAction(
  institution: string,
  scopePageId: string | null
): Promise<{ deletedCount: number } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const normalizedInstitution = normalizeInstitution(institution);
    const deletedCount = await clearScopeQuestions(supabase, user.id, normalizedInstitution, scopePageId);
    return { deletedCount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not clear the question history." };
  }
}
