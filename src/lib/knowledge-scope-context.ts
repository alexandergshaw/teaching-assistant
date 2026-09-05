// Resolve a knowledge-overview SCOPE (the whole institution, or one page plus
// all of its descendants - see src/lib/knowledge-overview-scope.ts's
// KnowledgeScope) into a framed, budgeted "Ask AI" context block, for the two
// server actions in src/app/actions/knowledge-overview.ts (the overview
// summary and the Ask AI question box).
//
// This duplicates (rather than imports) the shape of
// buildKnowledgeContextForTurn in src/app/api/ai-chat/route.ts:340-413 -
// deliberately: that route is I/O with no vitest coverage (environment
// "node" over src/**/*.test.ts only - no route-handler harness), so any
// refactor there risks silently changing the live chat "Ask AI" bulk action
// with every gate green (see BUILD.md conflict C5). The caps below
// (attachment count, per-file download size, non-fatal failure paths) are
// carried over VERBATIM from that route for the same reasons it has them;
// the page-id cap is deliberately DIFFERENT (400, not 100 - see
// MAX_SCOPE_PAGE_IDS below).
//
// A NOTE ON WHY THIS FILE FETCHES A FULL InstitutionPage[] UP FRONT, RATHER
// THAN CALLING getInstitutionPagesByIds: collectScopePages (Group B1, owning
// the "which pages are in scope, in what order" logic via buildPageTree) is
// pinned to take a full `InstitutionPage[]` - including body - as its input,
// because that is the same array the Knowledge tab's own React state already
// holds and reuses it against. There is no cheaper, body-less fetch that
// still satisfies that signature. listInstitutionPages(supabase, userId,
// institution) already fetches everything for one institution in a SINGLE
// query, which is the actual concern behind "don't do a Promise.all loop of
// per-id fetches" (an unbounded number of round trips against the 60s Vercel
// Hobby ceiling) - a single whole-institution fetch has fewer round trips
// than fetching page summaries and then re-fetching bodies by id would, not
// more. Course-instructor knowledge bases are realistically dozens of short
// policy pages (see src/lib/chat/knowledge-context.ts's own budget
// reasoning), so the extra bytes of an out-of-scope subtree's bodies are not
// a meaningful cost. This is flagged prominently in this feature's build
// report as a deliberate deviation from the letter of that instruction,
// while satisfying its actual intent (batched, not per-id, database access).
//
// RETRIEVAL TIERS (A3 of the best-practices addendum, corrected by X9):
// searchPages (knowledge-base.ts) matches a single literal substring and
// cannot be fed a natural-language question, so answering "how much time off
// do I get" needs an LLM to bridge the vocabulary gap. Tier 0 (the common
// case) simply dumps the whole scope and checks whether it fit. Only on
// overflow does Tier 1 (an LLM title router) and Tier 2 (a per-term literal
// keyword pass) run, UNIONED, with Tier 3 as a fallback that reuses Tier 0's
// own tree-ordered, budget-truncated attempt - "no pages searched" is never
// a valid outcome.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import {
  listInstitutionPages,
  normalizeInstitution,
  searchPages,
  type InstitutionPage,
} from "./knowledge-base";
import {
  listInstitutionPageAttachmentsForPages,
  INSTITUTION_ATTACHMENTS_BUCKET,
  MAX_ATTACHMENTS_PER_PAGE,
} from "./institution-page-attachments";
import { extractTextFromBuffer } from "./office-extract";
import { buildKnowledgeContextBlock, type KnowledgeContextAttachment } from "./chat/knowledge-context";
import {
  collectScopePages,
  describeScope,
  KNOWLEDGE_OVERVIEW_CONTEXT_MAX_CHARS,
} from "./knowledge-overview-scope";
import { significantWords } from "./embedded/scaffold";
import { callLlm, type LlmProvider } from "./llm";
// extractJsonObject is a plain, synchronous parser with no side effects; the
// same "use server" barrel is already imported by src/app/api/ai-chat/
// route.ts (a server-only, non-"use client"-reachable file, exactly like
// this one) for getWritingStyleBlock, so importing a second named function
// from it here follows established precedent rather than inventing a new
// pattern. This is NOT the knowledge-helpers.ts situation (X12): that file
// is unsafe to import into server code because it pulls in React hooks and
// a client hook (useInstitutions) transitively; shared.ts's chain (next/
// headers, other server actions) never reaches a browser bundle because
// this module is only ever imported by src/app/actions/knowledge-overview.ts,
// itself already server-only.
import { extractJsonObject } from "@/app/actions/shared";

// ---------------------------------------------------------------------------
// Page-id cap (X8).
// ---------------------------------------------------------------------------

/**
 * Cap on how many in-scope pages this feature will process at all, raised
 * from route.ts's MAX_KNOWLEDGE_CONTEXT_PAGE_IDS (100) to 400 for this
 * feature specifically. The character budget
 * (KNOWLEDGE_OVERVIEW_CONTEXT_MAX_CHARS, 120000 - declared once in Group
 * B1's knowledge-overview-scope.ts) is the REAL bound on how much content
 * ever reaches the model; this cap only bounds the number of rows and
 * attachment-list entries a single generate/ask click can pull, so it can
 * afford to be generous. Pages beyond this cap are reported separately as
 * `hardCappedPages` (X8) - NEVER folded into the budget's own `omittedPages`,
 * because they never even reach buildKnowledgeContextBlock and so never get
 * a pageResults entry; conflating the two would let the UI claim it searched
 * a page it never even considered.
 */
const MAX_SCOPE_PAGE_IDS = 400;

/**
 * Total attachment cap across one scope's worth of pages, mirroring route.ts's
 * MAX_KNOWLEDGE_CONTEXT_ATTACHMENTS. Despite the name, MAX_ATTACHMENTS_PER_PAGE
 * (institution-page-attachments.ts) is reused here as a TOTAL across every
 * page in scope, not a per-page limit - the brief's "30 per page" phrasing
 * matches route.ts's own comment, which reuses that constant's VALUE for a
 * turn-wide cap, independent of how many pages carry attachments.
 */
const MAX_SCOPE_CONTEXT_ATTACHMENTS = MAX_ATTACHMENTS_PER_PAGE;

/**
 * Per-attachment download cap, verbatim from route.ts's
 * MAX_KNOWLEDGE_ATTACHMENT_DOWNLOAD_BYTES: downloading a large file just to
 * extract text that the char budget will truncate to a few KB anyway would
 * waste time/memory on a file that could never survive intact.
 */
const MAX_SCOPE_ATTACHMENT_DOWNLOAD_BYTES = 5 * 1024 * 1024;

export interface ScopeContextPageRef {
  id: string;
  title: string;
}

export interface ScopeContextResult {
  /** "" when the scope has nothing to render (see buildKnowledgeContextBlock). */
  block: string;
  /** Human-readable scope description (Group B1's describeScope), for the
   * prompt turns' scope label. */
  scopeLabel: string;
  /** EVERY page in scope, tree order, regardless of cap/tier/budget outcome -
   * the fingerprint set src/app/actions/knowledge-overview.ts persists for
   * AC3's staleness diff. Never filtered - a page dropped for any reason
   * downstream must still appear here, or a later staleness check would
   * misread "always excluded" as "added" or "removed". */
  scopePages: { id: string; title: string; updatedAt: string }[];
  /** Pages whose content is actually IN `block` - the [P1]..[Pn] marker order
   * for citations (R5/X3), and AC2's "which pages it drew from" candidate
   * set. Tree order. */
  includedPages: ScopeContextPageRef[];
  /** In scope, under the id cap, and (for a question) selected by a
   * retrieval tier - but dropped by the CHAR BUDGET specifically. Computed by
   * a positional zip against buildKnowledgeContextBlock's own pageResults
   * (never derived from its includedPages/omittedPages counts - see this
   * module's zipPageResults). */
  omittedPages: ScopeContextPageRef[];
  /** Dropped by the MAX_SCOPE_PAGE_IDS cap (X8) - never considered at all,
   * so they carry no pageResults entry and must be named separately or the
   * UI would silently claim it summarized the whole institution. */
  hardCappedPages: ScopeContextPageRef[];
  /** In scope, under the id cap, but excluded by a retrieval tier's
   * narrowing (Tier 1/2 selected a genuine subset) before the budget ever
   * ran on them - distinct from `omittedPages` (which DID reach the budget).
   * Always [] for the summary path and for Tier 0/Tier 3 outcomes. */
  narrowedOutPages: ScopeContextPageRef[];
  /** Attachment file names that could not be read, were over the per-file
   * download cap, or were beyond MAX_SCOPE_CONTEXT_ATTACHMENTS. */
  skippedAttachments: string[];
  /** True when every under-cap in-scope page was at least considered for the
   * budget (Tier 0 or Tier 3); false when a retrieval tier successfully
   * narrowed the set (some in-scope, under-cap pages were never attempted at
   * all - see `narrowedOutPages`). Lets a caller state plainly what was
   * searched (AC5), never "no pages searched". */
  searchedAllScopePages: boolean;
}

/** Internal-only: extends the leaf module's KnowledgeContextAttachment with
 * the page id it belongs to, so a retrieval tier that narrows to a page
 * subset can filter already-extracted attachments by page membership. The
 * public KnowledgeContextAttachment shape has no id (only a title, which
 * duplicate page titles make an unsafe join key - the same reason page
 * citations are marker-indexed, not title-matched, elsewhere in this
 * feature), so this internal type carries it and is stripped before the
 * final buildKnowledgeContextBlock call. */
interface ExtractedAttachment extends KnowledgeContextAttachment {
  pageId: string;
}

function toContextAttachment(a: ExtractedAttachment): KnowledgeContextAttachment {
  return { pageTitle: a.pageTitle, fileName: a.fileName, text: a.text };
}

// ---------------------------------------------------------------------------
// Scope fetch + id cap.
// ---------------------------------------------------------------------------

async function fetchOrderedScopePages(
  supabase: SupabaseClient<Database>,
  userId: string,
  normalizedInstitution: string,
  scopePageId: string | null
): Promise<{ all: InstitutionPage[]; scopeLabel: string }> {
  // ONE query for the whole institution - see this file's header comment on
  // why this satisfies X7's actual concern (batched, not per-id, database
  // access) even though it does not literally call getInstitutionPagesByIds.
  const pages = await listInstitutionPages(supabase, userId, normalizedInstitution);
  const all = collectScopePages(pages, scopePageId);
  const scopeLabel = describeScope(pages, scopePageId, normalizedInstitution);
  return { all, scopeLabel };
}

function applyPageIdCap(pages: InstitutionPage[]): {
  capped: InstitutionPage[];
  hardCapped: ScopeContextPageRef[];
} {
  if (pages.length <= MAX_SCOPE_PAGE_IDS) return { capped: pages, hardCapped: [] };
  return {
    capped: pages.slice(0, MAX_SCOPE_PAGE_IDS),
    hardCapped: pages.slice(MAX_SCOPE_PAGE_IDS).map((p) => ({ id: p.id, title: p.title })),
  };
}

// ---------------------------------------------------------------------------
// Attachments - mirrors route.ts's buildKnowledgeContextForTurn caps and
// non-fatal-failure discipline VERBATIM (BUILD.md conflict C5 forbids
// touching that route; this is a deliberate duplicate).
// ---------------------------------------------------------------------------

async function fetchExtractedAttachments(
  supabase: SupabaseClient<Database>,
  userId: string,
  pages: InstitutionPage[]
): Promise<{ attachments: ExtractedAttachment[]; skipped: string[] }> {
  const pageIds = pages.map((p) => p.id);
  if (pageIds.length === 0) return { attachments: [], skipped: [] };
  const pageTitleById = new Map(pages.map((p) => [p.id, p.title]));

  let allAttachments;
  try {
    allAttachments = await listInstitutionPageAttachmentsForPages(supabase, userId, pageIds);
  } catch {
    // Non-fatal - degrade to a page-only context rather than failing the
    // whole generate/ask action over an attachment-listing error.
    return { attachments: [], skipped: [] };
  }

  const considered = allAttachments.slice(0, MAX_SCOPE_CONTEXT_ATTACHMENTS);
  const overflow = allAttachments.slice(MAX_SCOPE_CONTEXT_ATTACHMENTS);
  const skipped: string[] = overflow.map((a) => a.fileName);
  const extracted: ExtractedAttachment[] = [];

  for (const attachment of considered) {
    if (attachment.sizeBytes > MAX_SCOPE_ATTACHMENT_DOWNLOAD_BYTES) {
      skipped.push(attachment.fileName);
      continue;
    }
    try {
      const { data: blob, error } = await supabase.storage
        .from(INSTITUTION_ATTACHMENTS_BUCKET)
        .download(attachment.storagePath);
      if (error || !blob) {
        skipped.push(attachment.fileName);
        continue;
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const text = await extractTextFromBuffer(attachment.fileName, buffer);
      if (text && text.trim()) {
        extracted.push({
          pageId: attachment.pageId,
          pageTitle: pageTitleById.get(attachment.pageId) ?? "",
          fileName: attachment.fileName,
          text,
        });
      } else {
        skipped.push(attachment.fileName);
      }
    } catch {
      // Unreadable file (download failure, corrupt document, unsupported
      // format) - reported, never fails the whole request.
      skipped.push(attachment.fileName);
    }
  }

  return { attachments: extracted, skipped };
}

// ---------------------------------------------------------------------------
// Survivorship zip (copies the pattern at
// src/app/components/knowledge/knowledge-helpers.ts:582-591's
// includedContextPages, per X12 - NOT imported, since that file pulls React
// hooks and useInstitutions into this server-only module for one pure
// function).
// ---------------------------------------------------------------------------

function zipPageResults(
  pages: { id: string; title: string }[],
  pageResults: { title: string; included: boolean }[]
): { included: ScopeContextPageRef[]; omitted: ScopeContextPageRef[] } {
  // pageResults is positional over `pages`, captured INSIDE
  // buildKnowledgeContextBlock's own budget loop - that loop uses `continue`,
  // not `break` (knowledge-context.ts:221-233), so "the first N made it" is
  // false and this must be read positionally, never derived from the
  // included/omitted COUNTS.
  console.assert(
    pages.length === pageResults.length,
    "zipPageResults: pages/pageResults length mismatch - refusing to guess which pages were included"
  );
  if (pages.length !== pageResults.length) return { included: [], omitted: [] };
  const included: ScopeContextPageRef[] = [];
  const omitted: ScopeContextPageRef[] = [];
  for (let i = 0; i < pages.length; i++) {
    const ref = { id: pages[i].id, title: pages[i].title };
    if (pageResults[i].included) included.push(ref);
    else omitted.push(ref);
  }
  return { included, omitted };
}

function buildScopeResultFromPages(
  pages: InstitutionPage[],
  attachments: ExtractedAttachment[],
  skippedAttachments: string[],
  scopeLabel: string,
  scopePages: { id: string; title: string; updatedAt: string }[],
  hardCappedPages: ScopeContextPageRef[],
  narrowedOutPages: ScopeContextPageRef[],
  searchedAllScopePages: boolean
): ScopeContextResult {
  const block = buildKnowledgeContextBlock({
    pages: pages.map((p) => ({ title: p.title, body: p.body })),
    attachments: attachments.map(toContextAttachment),
    maxChars: KNOWLEDGE_OVERVIEW_CONTEXT_MAX_CHARS,
  });
  const { included, omitted } = zipPageResults(pages, block.pageResults);
  return {
    block: block.text,
    scopeLabel,
    scopePages,
    includedPages: included,
    omittedPages: omitted,
    hardCappedPages,
    narrowedOutPages,
    skippedAttachments,
    searchedAllScopePages,
  };
}

// ---------------------------------------------------------------------------
// Retrieval tiers (A3, corrected by X9) - Q&A path only. The summary path
// never narrows: AC2 requires it to synthesize every in-scope page, so any
// overflow there is left entirely to buildKnowledgeContextBlock's own
// char-budget truncation (AC9).
// ---------------------------------------------------------------------------

function buildTitleRouterPrompt(scopeLabel: string, pages: InstitutionPage[], question: string): string {
  const listing = pages
    .map((p, i) => {
      const title = p.title.trim() || "Untitled page";
      const tags = p.tags.length > 0 ? ` [${p.tags.join(", ")}]` : "";
      return `${i + 1}. ${title}${tags}`;
    })
    .join("\n");
  return [
    `You are choosing which pages of a college instructor's own knowledge base (${scopeLabel}) could bear on one question, so they can be read in full before it is answered.`,
    "",
    `THE QUESTION: ${question}`,
    "",
    "PAGES (numbered):",
    listing,
    "",
    'The instructor rarely uses the same words as their own pages. "Time off" may be written as leave, PTO, personal days, sick days, bereavement, or absence. "Late work" may be overdue, past due, extensions, make-up work, or a grace period. "Attendance" may be roster, census, participation, no-show, drop, or verification. Treat any page that could plausibly answer the question under a different name as a match.',
    "",
    "Prefer OVER-selecting: including a page that turns out to be irrelevant costs nothing, but leaving out a page that would have answered the question is a real failure. When in doubt, include it.",
    "",
    "Return ONLY a JSON object, no prose, no code fence:",
    '{"pageIndexes": [the numbers, from the list above, of every page that could bear on the question]}',
    'Return {"pageIndexes": []} if none could.',
  ].join("\n");
}

/**
 * Tier 1: ask the model which page NUMBERS (never titles - no title
 * round-trip, no duplicate-title ambiguity) could bear on the question.
 * Never throws: a network failure, a non-OK response, or unparseable JSON
 * all degrade to [] so Tier 2/Tier 3 can carry the question instead (A3's
 * "router failed" fallback case).
 */
async function routerSelectPageIndexes(
  pages: InstitutionPage[],
  question: string,
  scopeLabel: string,
  provider: LlmProvider
): Promise<number[]> {
  if (pages.length === 0) return [];
  try {
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: buildTitleRouterPrompt(scopeLabel, pages, question) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512, responseMimeType: "application/json" },
      },
      provider
    );
    if (!result.ok || !result.text.trim()) return [];
    const parsed = extractJsonObject(result.text);
    const raw = parsed?.pageIndexes;
    if (!Array.isArray(raw)) return [];
    const seen = new Set<number>();
    for (const value of raw) {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isInteger(n) && n >= 1 && n <= pages.length) seen.add(n);
    }
    return [...seen];
  } catch {
    return [];
  }
}

/**
 * Tier 2 search terms. X9: significantWords' second argument is a MINIMUM
 * WORD LENGTH, not a count - significantWords(question, 4) drops "PTO" (3
 * characters), the user's own headline example, so this calls it with 3.
 * scaffold.ts's built-in stopword list is tuned for learning-objective text
 * (it keeps near-meaningless-for-this-feature words like "policy" and
 * "rule"); POLICY_QUESTION_STOPWORDS extends it locally for policy
 * questions, per X9/A3.
 */
const POLICY_QUESTION_STOPWORDS = new Set([
  "much",
  "many",
  "need",
  "take",
  "give",
  "allow",
  "policy",
  "rule",
  "rules",
]);

function tierTwoTerms(question: string): string[] {
  const words = significantWords(question, 3).filter((w) => !POLICY_QUESTION_STOPWORDS.has(w));
  const trimmed = question.trim();
  // Always search the raw trimmed question when it is a single token (X9) -
  // a bare "PTO" (or a two-letter token below significantWords' own
  // minLength) must still reach searchPages regardless of what the
  // stopword/length filtering above did to it.
  if (trimmed && !/\s/.test(trimmed) && !words.includes(trimmed.toLowerCase())) {
    words.push(trimmed);
  }
  return words;
}

// ---------------------------------------------------------------------------
// Public entry points.
// ---------------------------------------------------------------------------

/**
 * Resolve context for the overview SUMMARY (AC2: synthesizes every in-scope
 * page - no question, so no retrieval narrowing; Tier 0's whole-scope dump
 * is the only tier this path ever uses).
 */
export async function resolveSummaryScopeContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string,
  scopePageId: string | null
): Promise<ScopeContextResult> {
  const normalizedInstitution = normalizeInstitution(institution);
  const { all, scopeLabel } = await fetchOrderedScopePages(supabase, userId, normalizedInstitution, scopePageId);
  const scopePages = all.map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt }));
  const { capped, hardCapped } = applyPageIdCap(all);
  const { attachments, skipped } = await fetchExtractedAttachments(supabase, userId, capped);
  return buildScopeResultFromPages(capped, attachments, skipped, scopeLabel, scopePages, hardCapped, [], true);
}

/**
 * Resolve context for one Ask AI QUESTION (A3's full tiered retrieval).
 */
export async function resolveQuestionScopeContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string,
  scopePageId: string | null,
  question: string,
  provider: LlmProvider
): Promise<ScopeContextResult> {
  const normalizedInstitution = normalizeInstitution(institution);
  const { all, scopeLabel } = await fetchOrderedScopePages(supabase, userId, normalizedInstitution, scopePageId);
  const scopePages = all.map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt }));
  const { capped, hardCapped } = applyPageIdCap(all);
  const { attachments, skipped } = await fetchExtractedAttachments(supabase, userId, capped);

  // Tier 0 (A3): try the whole (capped) scope first - the common case.
  const wholeScopeResult = buildScopeResultFromPages(
    capped,
    attachments,
    skipped,
    scopeLabel,
    scopePages,
    hardCapped,
    [],
    true
  );
  if (wholeScopeResult.omittedPages.length === 0) return wholeScopeResult;

  // Overflow - narrow via Tier 1 (LLM title router) UNIONED with Tier 2
  // (literal keyword search). Both run regardless of the other's outcome -
  // UNION, never intersection (A3) - each catches a failure mode the other
  // misses (vocabulary mismatch vs. a literal term/form-number/course-code
  // the router skims past).
  const routerIndexes = await routerSelectPageIndexes(capped, question, scopeLabel, provider);
  const tier2Ids = new Set<string>();
  for (const term of tierTwoTerms(question)) {
    for (const hit of searchPages(capped, term)) tier2Ids.add(hit.page.id);
  }
  const selectedIds = new Set<string>(tier2Ids);
  for (const idx of routerIndexes) {
    const page = capped[idx - 1];
    if (page) selectedIds.add(page.id);
  }

  if (selectedIds.size === 0) {
    // Tier 3 fallback (A3): router failed/empty AND no literal term hit
    // anything. Fill the budget in TREE ORDER from the scope root - NEVER
    // return "no pages searched". This is exactly the Tier-0 attempt above
    // (already tree-ordered and budget-truncated), reused rather than
    // recomputed.
    return wholeScopeResult;
  }

  // Tiers 1/2 selected a genuine subset - rebuild in TREE ORDER (never score
  // order, per A3's closing note) from just those pages, carrying only
  // their own already-extracted attachments along.
  const narrowedPages = capped.filter((p) => selectedIds.has(p.id));
  const narrowedIds = new Set(narrowedPages.map((p) => p.id));
  const narrowedAttachments = attachments.filter((a) => narrowedIds.has(a.pageId));
  const narrowedOutPages: ScopeContextPageRef[] = capped
    .filter((p) => !narrowedIds.has(p.id))
    .map((p) => ({ id: p.id, title: p.title }));

  return buildScopeResultFromPages(
    narrowedPages,
    narrowedAttachments,
    skipped,
    scopeLabel,
    scopePages,
    hardCapped,
    narrowedOutPages,
    false
  );
}
