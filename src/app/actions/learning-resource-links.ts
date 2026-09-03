"use server";

// Contract 2 of docs/learning-resources-real-links-acceptance-criteria.md:
// find real, verified doc/video/tutorial links for a bounded list of
// concepts. This is a REVISION of the shipped "Learning resources" generator
// (docs/learning-resources-page-acceptance-criteria.md, REGRESSION entry
// 322), which deliberately emitted NO links because a model asked to recall
// a URL fabricates one at a high rate (src/lib/urls.ts:8-11 - 37 dead links
// out of 73 in a real generated course). This module is what changes that:
// every link on the page must pass three independent gates before it is
// returned - see the module doc comment in the AC file for the full
// rationale. A "use server" module may export only async functions (see
// src/lib/use-server-exports.test.ts), so every type and pure helper lives
// alongside the exported action in this same file (there is no plain
// sibling module for this feature, unlike current-events.ts's split, because
// nothing here is imported from client code).
//
// TWO CALLS PER CONCEPT (D1) - the property that matters most. A grounded
// call (webSearch: true) that ALSO demands "return ONLY valid JSON" reliably
// makes Gemini skip the search and answer from parametric memory instead
// (current-events.ts:98-105, 140-150 documents this exact failure mode, and
// textbook-research.ts's module comment independently confirms it for a
// different feature). So call 1 (researchConceptOnce) asks for prose and
// carries no JSON instruction; call 2 (structureProseIntoResourceItems) is a
// SEPARATE, ungrounded call that structures that prose into JSON. Never
// collapse these into one call - a single-call version looks identical and
// passes every test that doesn't inspect grounding sources, which is exactly
// how the original 51% dead-link rate reached production.
//
// BUDGET (D6): prod is Vercel Hobby, 60s, called from a Server Action behind
// a button. Unlike current-events.ts's pipeline, this feature has no topic
// extraction or cross-cutting synthesis call - concepts arrive pre-derived
// from the caller (Contract 3 owns deriving them from course materials) - so
// the entire LLM budget is the per-concept grounded+structure pair, fanned
// out with Promise.allSettled so wall-clock cost is dominated by ONE
// concept's pair (with at most one retry), not the number of concepts.
// MAX_CONCEPTS_PER_RUN (6) x MAX_ITEMS_PER_CONCEPT (4) bounds the candidate
// URL count to at most 24 (fewer once the cross-concept dedupe below removes
// duplicates - see the reachability call site) before the reachability
// check, which matters because that check (src/lib/url-reachability.ts,
// Contract 1) has its own fixed total budget (REACHABILITY_TOTAL_BUDGET_MS =
// 12000) and concurrency (REACHABILITY_MAX_CONCURRENT = 6). The naive count
// is 24 URLs at 6-way concurrency = 4 rounds, and 4 rounds at the checker's
// own 3s per-request timeout is exactly 12s - but that arithmetic silently
// assumes every URL costs exactly ONE attempt. A server that rejects HEAD
// (405/501) costs a SECOND attempt (checkOneUrl's GET retry,
// url-reachability.ts:160-164), doubling that url's share of the shared
// budget and pushing whatever the worker pool picks up next past the
// deadline into `reason: "budget"` - dropped as unreachable, not because it
// was actually checked and failed. This is a real risk at the documented
// cap, not a hypothetical: raising either constant, or a run that happens to
// hit several HEAD-rejecting hosts, both cut into the same fixed 12s budget
// with no compensating adjustment.
//
// RETRY BUDGET (Finding 3): callLlm (src/lib/llm.ts:232) passes no
// AbortSignal and no timeout to the underlying Gemini call, so nothing
// bounds how long ONE grounded+structure pair can take. researchConceptWithRetry
// below can therefore double a concept's worst-case LLM cost - two slow pairs
// back to back can reach 90-100s against a Server Action with no
// maxDuration, set against Vercel Hobby's hard 60s ceiling (see
// lms-generation.ts:329-342 on why long-running generation was moved off
// this exact path). Rather than adding a timeout to callLlm itself (a
// shared, cross-feature helper this module does not own), every retry
// decision here is gated on RETRY_BUDGET_MS, a wall-clock budget for the
// WHOLE run measured from when findResourceLinksForConceptsAction started:
// once that budget is spent, a concept's first attempt still runs (so a run
// under load still returns whatever it can), but no concept retries. The
// clock is injectable (the `now` option, precedented by
// src/lib/url-reachability.ts's own `now` option) so this is deterministically
// testable with no real waiting.
import { callLlm, type LlmProvider, type Source } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { verifyItemUrls, isPlaceholderUrl, type ParsedTopicItem } from "@/lib/workflows/current-events-report";
import { checkUrlsReachable } from "@/lib/url-reachability";
import { RESOURCE_KINDS, type ResourceKind } from "@/lib/resource-kind";
// Y1/Y2 (docs/reply-resource-search-yield-acceptance-criteria.md): ONE
// resolver per run (created below in findResourceLinksForConceptsAction,
// shared by every concept) resolves each concept's grounding-redirect
// sources to their real publisher pages before the structuring call ever
// runs - see grounding-sources.ts's own module comment for why this exists.
import { createGroundingResolver, isRealHostSource, type GroundingResolver } from "@/lib/grounding-sources";
import {
  kindSchemaAlternation,
  kindProseList,
  kindDescriptionList,
  parseResourceItems,
  sourcesVisitedBlock,
  boundVisitedSources,
  type CandidateResourceItem,
} from "@/lib/resource-item-parsing";
import type { ConceptOutcome } from "@/lib/resource-search-outcome";

const MAX_CONCEPTS_PER_RUN = 6;
const MAX_ITEMS_PER_CONCEPT = 4;
// A concept's grounded call can return more sources than are worth spending
// a redirect-resolution fetch on - bounds each concept's contribution to the
// run's shared resolver budget/pool independent of how many sources one
// grounded call happened to return. Sources past this cap pass through the
// resolver call unchanged (never resolved, never dropped).
const MAX_SOURCES_TO_RESOLVE = 10;
// Call 1 (grounded prose search) per concept.
const PER_CONCEPT_MAX_TOKENS = 2048;
// Call 2 (ungrounded structuring of that prose into JSON) per concept.
const PER_CONCEPT_STRUCTURE_MAX_TOKENS = 1024;
const PER_CONCEPT_STRUCTURE_INPUT_CHAR_CAP = 6000;
// Finding 3: once this much wall-clock time has elapsed since the run
// started, no concept retries - it keeps whatever its single attempt
// produced. Leaves headroom for checkUrlsReachable's own
// REACHABILITY_TOTAL_BUDGET_MS (12s) plus buffer under Vercel Hobby's 60s
// ceiling even when every concept's first attempt is slow. Not exported - a
// "use server" module may export only async functions and types (see
// src/lib/use-server-exports.test.ts); a test that needs a different budget
// passes `options.retryBudgetMs` to the exported action instead of importing
// this constant.
//
// Y3 (docs/reply-resource-search-yield-acceptance-criteria.md): dropped from
// 40 000 to 32 000 - a retry that starts late, plus Y1's grounding-resolve
// round (up to 5s, GROUNDING_RESOLVE_TOTAL_BUDGET_MS), plus
// checkUrlsReachable's own 12s budget, must still fit under Vercel Hobby's
// 60s ceiling.
const RETRY_BUDGET_MS = 32_000;

// Y3: prepended (with a blank line) to the research prompt on a retry only -
// the FIRST attempt's prompt stays byte-identical to before this existed
// (Section 4 / test 5(e)).
const RETRY_NUDGE_LINE = "Use the Google Search tool for this request. Do not answer from memory.";

export interface ResourceLink {
  concept: string;
  title: string;
  url: string;
  // The full five-way ResourceKind union (src/lib/resource-kind.ts), not
  // just this action's own default three - see the ResourceProfile comment
  // below. The DEFAULT call (this action's 3-argument call sites, e.g. the
  // shipped Learning Resources page) only ever asks the model for doc,
  // video or tutorial, so "news"/"paper" reach this field only when a
  // caller opts in with its own resourceProfile argument.
  kind: ResourceKind;
  /** One line on what the student gets from it. */
  whatYouGet: string;
}

export interface FindResourceLinksSuccess {
  links: ResourceLink[];
  /** True when NO concept's grounded call returned any source at all - the
   *  model answered from memory (B2). The page then carries no links. */
  degraded: boolean;
  droppedUncorroborated: number;
  droppedPlaceholder: number;
  droppedUnreachable: number;
  /** Surfaced verbatim, never dropped (C5). */
  notes: string[];
  /** Y5 (docs/reply-resource-search-yield-acceptance-criteria.md): per-concept
   *  accounting, one entry per bounded concept in input order - see
   *  ConceptOutcome (src/lib/resource-search-outcome.ts) for the field-by-field
   *  arithmetic. Every field above (droppedUncorroborated/droppedPlaceholder/
   *  droppedUnreachable, and links.length via `kept`) equals the sum of this
   *  array's corresponding field. `droppedDuplicate` is the one ConceptOutcome
   *  field with NO top-level counterpart here - a deduped repeat never reached
   *  the reachability check, so it must never inflate this type's own
   *  droppedUnreachable; it is visible only per concept, in `perConcept`. */
  perConcept: ConceptOutcome[];
}

// coerceResourceKind used to be a private copy of this exact logic (three-
// way union only). It is now imported from the shared leaf,
// src/lib/resource-kind.ts, which discussion-capture.ts also imports for
// the discussion-reply resources feature - see
// docs/discussion-reply-resources-acceptance-criteria.md R1. Two
// implementations of the same coercion is how the last group shipped a
// tested-but-dead twin (REGRESSION 367 defect 4).

/**
 * Selects which kind(s) of resource this action searches for and is allowed
 * to return, and the prose fragment describing them to the grounded call.
 * Not exported (a "use server" module's export-shape rule technically
 * permits `export interface`, but this module's exported type surface is
 * deliberately kept to ResourceLink/FindResourceLinksSuccess alone) - a
 * caller passes a structurally-matching object literal.
 *
 * `kinds` MUST be built from RESOURCE_KINDS (the same constant
 * coerceResourceKind validates against), never restated as a hand-typed
 * literal array - a coercion and the prompt that describes it disagreeing
 * is a failure this repo has already had (R2).
 */
interface ResourceProfile {
  kinds: readonly ResourceKind[];
  /** e.g. "official documentation, video tutorials, and written tutorials" */
  resourceTypeSentence: string;
  /** discussion-reply resources feature, video-length-preference setting:
   *  an optional extra sentence appended to the end of the research prompt's
   *  guidance paragraph (researchConceptOnce below), verbatim. Never mentions
   *  a hard requirement - this action has no way to confirm a candidate
   *  video's actual runtime (no field on CandidateResourceItem/ResourceLink
   *  carries a duration, and neither the grounded search call nor the
   *  reachability check below ever inspects one), so any caller-supplied
   *  text here MUST be worded as a preference the model may or may not be
   *  able to satisfy, never as a guarantee - see discussion-replies.ts's
   *  own `videoLengthPreferenceSentence` for the one real caller. Omitted
   *  (undefined) leaves the prompt byte-identical to a call that never
   *  mentioned this field at all, via the same `? ... : ""` pattern
   *  `resourceProfile` itself already uses at its own call site - every
   *  existing 3- and 4-argument call to findResourceLinksForConceptsAction
   *  (including this feature's own default-profile calls) is unaffected. */
  extraGuidance?: string;
}

// Today's exact three-kind behaviour (REGRESSION 324). This is the default
// for every call that omits its own resourceProfile - including the
// shipped Learning Resources page's call site
// (learning-resources-generator.ts), which must see byte-identical prompts.
// Derived from RESOURCE_KINDS by filtering (not a fresh `["doc","video",
// "tutorial"]` literal) so this list can only ever name kinds the shared
// leaf actually recognizes.
const DEFAULT_RESOURCE_KINDS: readonly ResourceKind[] = RESOURCE_KINDS.filter(
  (kind) => kind === "doc" || kind === "video" || kind === "tutorial"
);

const DEFAULT_RESOURCE_PROFILE: ResourceProfile = {
  kinds: DEFAULT_RESOURCE_KINDS,
  resourceTypeSentence: "official documentation, video tutorials, and written tutorials",
};

/**
 * Call 2 of the two-call shape: convert call 1's grounded prose into the
 * fixed {"items":[...]} JSON, with NO web search - see the module doc
 * comment for why this instruction must never appear alongside
 * webSearch: true. Throws on a call failure so researchConceptWithRetry can
 * catch it and retry the whole pair, mirroring
 * current-events.ts's structureProseIntoItems.
 *
 * Y2: `visitedSources` is this concept's grounding sources that the run's
 * resolver actually turned into a real (non-redirect-host) page - see
 * researchConceptOnce. `boundVisitedSources` (src/lib/resource-item-parsing.ts)
 * is applied ONCE here and the SAME bounded array backs both the prompt
 * (sourcesVisitedBlock) and the index lookup (parseResourceItems's own
 * `sourceUrls`) - a model's "source": <n> and the lookup it drives always
 * agree on what n means, and an oversized or excess source can never appear
 * in the prompt OR be selected by index. When the bounded list is non-empty,
 * the prompt also asks the model to tag each item with which (if any) of
 * those pages it is, and parseResourceItems uses that tag to replace the
 * item's url with the resolved page's url.
 */
async function structureProseIntoResourceItems(
  prose: string,
  provider: LlmProvider,
  profile: ResourceProfile,
  visitedSources: readonly Source[]
): Promise<CandidateResourceItem[]> {
  if (!prose.trim()) return [];

  const boundedSources = boundVisitedSources(visitedSources);
  const sourcesBlock = sourcesVisitedBlock(boundedSources);
  // Section 4 / test 5(e): with zero visited sources this is "", so the
  // whole prompt below collapses to exactly today's byte-identical text -
  // the same `? ... : ""` pattern already used for extraGuidance.
  const schemaSourceField = boundedSources.length > 0 ? `,"source":<number or null>` : "";

  const prompt = `Convert the following research notes into structured JSON. Use only information present in the notes below - do not add, invent, look up, or infer anything that isn't already stated there.

RESEARCH NOTES:
${prose.slice(0, PER_CONCEPT_STRUCTURE_INPUT_CHAR_CAP)}${sourcesBlock}

Return ONLY valid JSON in this exact shape:
{"items":[{"title":"...","url":"...","kind":"${kindSchemaAlternation(profile.kinds)}","whatYouGet":"..."${schemaSourceField}}]}

"kind" must be exactly one of ${kindProseList(profile.kinds)}. No markdown fences, no commentary. If the notes contain no items, return {"items":[]}.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: PER_CONCEPT_STRUCTURE_MAX_TOKENS },
    },
    provider
  );

  if (!result.ok) {
    throw new Error(`HTTP ${result.status}`);
  }

  return parseResourceItems(
    result.text,
    MAX_ITEMS_PER_CONCEPT,
    boundedSources.map((s) => s.uri)
  );
}

/**
 * Call 1 of the two-call shape: a grounded (webSearch: true) call that asks
 * for a browsable prose answer, never JSON - see the module doc comment for
 * why. Throws on a transport failure so researchConceptWithRetry can retry
 * the whole pair, mirroring current-events.ts's researchTopicOnce.
 *
 * Y1/Y2: `resolver` is the ONE resolver shared by the whole run (created once
 * in findResourceLinksForConceptsAction). This concept's grounded sources are
 * resolved BEFORE the structuring call - the returned `sources` are always
 * the RESOLVED ones (Y4: verifyItemUrls sees real hosts, not the opaque
 * redirect), and `resolvedCount` is how many of them the resolver actually
 * turned from a redirect link into a real page (used for Y5's
 * ConceptOutcome.resolvedSources and to build the structuring call's
 * "SOURCES VISITED" list - see structureProseIntoResourceItems). A source
 * that was already a direct, non-redirect uri does NOT count as "resolved"
 * here and is never listed as visited - it cost the resolver no fetch (see
 * grounding-sources.ts's resolveOne) and was already visible to the model in
 * its own grounded prose, so Section 4's byte-identical-prompt guarantee for
 * a fixture with no redirect-host sources holds.
 *
 * Y3: `isRetry` prepends RETRY_NUDGE_LINE (plus a blank line) to this
 * prompt - the FIRST attempt never sets it, so its prompt stays byte-
 * identical to before Y3 existed.
 */
async function researchConceptOnce(
  concept: string,
  courseKind: string,
  provider: LlmProvider,
  profile: ResourceProfile,
  resolver: GroundingResolver,
  isRetry: boolean
): Promise<{ items: CandidateResourceItem[]; sources: Source[]; sourceCount: number; resolvedCount: number }> {
  const kindLabel = courseKind.trim() ? ` for a ${courseKind.trim()} course` : "";
  // Video-length-preference setting (discussion-reply resources feature):
  // appended verbatim, never reworded here - see ResourceProfile.extraGuidance's
  // own doc comment for why this must stay a stated preference. "" (the
  // common case - every existing caller) leaves the template literal below
  // byte-identical to before this field existed.
  const guidance = profile.extraGuidance ? `\n\n${profile.extraGuidance}` : "";
  const basePrompt = `You are an expert educator finding learning resources${kindLabel} for a student studying one concept.

CONCEPT: ${concept}

Search the web first, then report up to ${MAX_ITEMS_PER_CONCEPT} real resources for a student learning this concept: ${profile.resourceTypeSentence}, appropriate to the course level.

For each resource you find, write a short paragraph in plain prose giving: the resource's title, whether it is ${kindDescriptionList(profile.kinds)}, the exact URL of the page you visited to find it, and one sentence on what a student gets from it.${guidance}

If a web search turns up nothing relevant for this concept, say so plainly instead of inventing a resource.`;
  const prompt = isRetry ? `${RETRY_NUDGE_LINE}\n\n${basePrompt}` : basePrompt;

  const grounded = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: PER_CONCEPT_MAX_TOKENS },
      webSearch: true,
    },
    provider
  );

  if (!grounded.ok) {
    throw new Error(`HTTP ${grounded.status}`);
  }

  const rawSources = grounded.sources ?? [];
  // MAX_SOURCES_TO_RESOLVE: only the first N sources ever reach the run's
  // shared resolver - the rest pass through exactly as returned (never
  // resolved, never dropped), same as any source the resolver itself leaves
  // unchanged. Keeps one concept's oversized source list from spending the
  // whole run's shared fetch budget/pool.
  const sourcesToResolve = rawSources.slice(0, MAX_SOURCES_TO_RESOLVE);
  const passthroughSources = rawSources.slice(MAX_SOURCES_TO_RESOLVE);
  const resolvedHead = sourcesToResolve.length > 0 ? await resolver.resolve(sourcesToResolve) : [];
  const resolvedSources = [...resolvedHead, ...passthroughSources];
  const visitedSources = resolvedSources.filter(
    (resolved, i) => resolved.uri !== rawSources[i].uri && isRealHostSource(resolved)
  );

  const items = await structureProseIntoResourceItems(grounded.text, provider, profile, visitedSources);

  return { items, sources: resolvedSources, sourceCount: rawSources.length, resolvedCount: visitedSources.length };
}

/**
 * Research one concept, with AT MOST one retry on a transient failure (a
 * thrown transport error) or an empty result - exactly current-events.ts's
 * researchTopicWithRetry shape (D6), EXCEPT the retry is additionally gated
 * on `hasRetryBudget()` (Finding 3): once the whole run's elapsed time has
 * passed RETRY_BUDGET_MS, the retry is skipped and the first attempt's
 * result (or, on the catch path, its thrown error) is returned/rethrown as
 * final - this is what keeps an unlucky run of slow callLlm calls (which
 * carries no timeout of its own) from doubling its wall-clock cost against
 * the 60s ceiling. After a retry that DOES run, an empty/failed result still
 * returns/throws to the caller: per-concept failures never throw past the
 * caller's Promise.allSettled boundary uncaught here, but they DO surface as
 * either a rejection or an empty items array so the caller can record a
 * note. `retried` tells the caller whether a second attempt actually ran, so
 * its note wording ("even after one retry") is never said when the budget
 * caused the retry to be skipped.
 *
 * Y3: a first attempt that returned items but NO sources also retries now -
 * a memory-answer (the model skipped Google Search entirely) used to get
 * exactly one attempt because it "succeeded" by the old items-only check;
 * see the module header's diagnosis (finding 1). Both branches share the
 * SAME `resolver` across the first attempt and any retry (Y1/Y7 - one shared
 * budget and pool for the whole run, not reset per attempt).
 */
async function researchConceptWithRetry(
  concept: string,
  courseKind: string,
  provider: LlmProvider,
  hasRetryBudget: () => boolean,
  profile: ResourceProfile,
  resolver: GroundingResolver
): Promise<{
  items: CandidateResourceItem[];
  sources: Source[];
  sourceCount: number;
  resolvedCount: number;
  retried: boolean;
}> {
  try {
    const first = await researchConceptOnce(concept, courseKind, provider, profile, resolver, false);
    const needsRetry = first.items.length === 0 || first.sourceCount === 0;
    if (!needsRetry || !hasRetryBudget()) return { ...first, retried: false };
    const second = await researchConceptOnce(concept, courseKind, provider, profile, resolver, true);
    return { ...second, retried: true };
  } catch (err) {
    if (!hasRetryBudget()) throw err;
    const second = await researchConceptOnce(concept, courseKind, provider, profile, resolver, true);
    return { ...second, retried: true };
  }
}

/**
 * Find real, verified learning-resource links for a bounded list of
 * concepts. Every candidate URL must clear three independent gates before it
 * is returned - see the AC doc's "What changes" section for the full
 * rationale:
 *
 *   1. It came from a grounded (webSearch: true) call's own prose, then was
 *      extracted by a second, ungrounded structuring call (D1).
 *   2. It is corroborated by that SAME concept's grounding sources
 *      (verifyItemUrls, current-events-report.ts) and is not a
 *      placeholder (isPlaceholderUrl). Either failure DROPS the item outright
 *      (B1/B3) rather than rendering it "unverified" - this page is a list of
 *      links, so a blanked link has nothing left to be.
 *   3. It resolves (checkUrlsReachable, src/lib/url-reachability.ts,
 *      Contract 1) - anything not alive is dropped (B4).
 *
 * Placeholder and corroboration failures are counted SEPARATELY
 * (droppedPlaceholder vs droppedUncorroborated) even though verifyItemUrls
 * itself blanks both the same way (it calls isPlaceholderUrl internally) -
 * if placeholder candidates were passed into
 * verifyItemUrls, its output would make the two failure reasons
 * indistinguishable. So isPlaceholderUrl is checked FIRST, here, on the raw
 * candidate list; only genuine non-placeholder candidates are handed to
 * verifyItemUrls, so anything IT blanks can only be a real URL that failed
 * corroboration. The instructor needs to know WHY a concept came back
 * linkless, and this is what keeps the three counts meaningful and disjoint.
 *
 * D2/B5 (a Gemini grounding redirect host must never be the link on the
 * page): guaranteed structurally, not by a separate filter. verifyItemUrls's
 * own isCorroborated check always returns
 * false for the grounding redirect host, so a candidate url on that host can
 * never survive the corroboration gate - it is always dropped as
 * uncorroborated, never rendered.
 */
export async function findResourceLinksForConceptsAction(
  concepts: readonly string[],
  courseKind?: string,
  provider: LlmProvider = "gemini",
  // Finding 3: test-only seam. `now` lets the retry-budget cutoff be driven
  // deterministically (no real waiting - precedented by url-reachability.ts's
  // own `now` option); `retryBudgetMs` lets a test use a budget far smaller
  // than RETRY_BUDGET_MS without waiting for the real one to elapse.
  // `resolver` lets a test inject a whole GroundingResolver (e.g. one built
  // with createGroundingResolver({ fetchImpl }) over a mocked fetch) so a
  // mocked redirect-host source never reaches real `fetch`, exactly like
  // checkUrlsReachable's own injected-fetch tests never touch the network.
  // None of these three fields is meant to be passed by a real caller - all
  // default to the real clock, the real budget, and a resolver created below
  // with the real clock - so every existing 3-argument call site (the
  // sibling generator's call in lms-generation.ts) is unaffected.
  options?: { now?: () => number; retryBudgetMs?: number; resolver?: GroundingResolver },
  // R2: an optional resource-profile argument selecting (a) the prose
  // call's resource-type sentence and (b) the structuring call's allowed-
  // kind list. Defaults to DEFAULT_RESOURCE_PROFILE (today's exact
  // three-kind behaviour), so every existing 3- and 4-argument call site -
  // the shipped Learning Resources page's call in
  // learning-resources-generator.ts among them - is byte-unaffected. A
  // widened profile (e.g. all five RESOURCE_KINDS, for the discussion-reply
  // resources feature) is passed positionally here, never merged into
  // `options` above - that object is a test-only clock/budget seam (see its
  // own doc comment), and a resource-profile IS meant to be passed by a
  // real caller.
  resourceProfile?: ResourceProfile
): Promise<FindResourceLinksSuccess | { error: string }> {
  // The embedded provider makes no network call, so it can neither search
  // nor verify a link (D5) - short-circuit BEFORE any callLlm, mirroring
  // every other action that supports embedded (e.g. textbook-research.ts's
  // recommendTextbooksAction, canvas-accessibility.ts).
  if (provider === "embedded") {
    return {
      error:
        "The embedded engine cannot search the web for learning resources. Switch to an LLM provider to find real links.",
    };
  }

  try {
    await requireOwner();

    const trimmedConcepts = concepts.map((c) => c.trim()).filter(Boolean);
    if (trimmedConcepts.length === 0) {
      return { error: "Provide at least one concept to search for learning resources." };
    }
    // A1/D6: bounded before any search runs, regardless of what the caller
    // (Contract 3's concept-derivation step) already clamped to - this
    // action must stay inside its own budget independent of its caller.
    const boundedConcepts = trimmedConcepts.slice(0, MAX_CONCEPTS_PER_RUN);

    // Finding 3: one shared clock and budget for the WHOLE run, read by every
    // concept's researchConceptWithRetry call - the fan-out below starts all
    // of them at roughly the same moment, so a single "time since the run
    // started" cutoff is what actually bounds worst-case wall time, not a
    // per-concept timer.
    const now = options?.now ?? Date.now;
    const retryBudgetMs = options?.retryBudgetMs ?? RETRY_BUDGET_MS;
    const startedAt = now();
    const hasRetryBudget = () => now() - startedAt < retryBudgetMs;
    const profile = resourceProfile ?? DEFAULT_RESOURCE_PROFILE;

    // Y1/Y7: ONE resolver for the whole run, shared by every concept's
    // researchConceptWithRetry call below (and, within that, by both its
    // first attempt and any retry) - one worker pool, one wall-clock budget,
    // one uri->Source cache. `options.resolver` lets a test inject its own
    // (over a mocked fetch); a real caller never sets it, so this call site
    // creates one here with the real clock.
    const resolver = options?.resolver ?? createGroundingResolver();

    const notes: string[] = [];
    const settled = await Promise.allSettled(
      boundedConcepts.map((concept) =>
        researchConceptWithRetry(concept, courseKind ?? "", provider, hasRetryBudget, profile, resolver)
      )
    );

    let anySourcesAtAll = false;
    let droppedPlaceholder = 0;
    let droppedUncorroborated = 0;
    // Y5: one entry per bounded concept, filled in below as each settles -
    // an array indexed by position (not a Map keyed by concept text), since
    // duplicate concept strings within one run must still get their own,
    // separate ConceptOutcome entries.
    const perConcept: ConceptOutcome[] = new Array(boundedConcepts.length);
    const survivors: Array<{ index: number; concept: string; item: CandidateResourceItem }> = [];

    settled.forEach((outcome, i) => {
      const concept = boundedConcepts[i];

      if (outcome.status === "rejected") {
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        notes.push(`Concept "${concept}" failed: ${reason}`);
        perConcept[i] = {
          concept,
          sources: 0,
          resolvedSources: 0,
          candidates: 0,
          droppedPlaceholder: 0,
          droppedUncorroborated: 0,
          droppedDuplicate: 0,
          droppedUnreachable: 0,
          kept: 0,
          retried: false,
          failed: reason,
        };
        return;
      }

      const { items, sources, sourceCount, resolvedCount, retried } = outcome.value;
      if (sources.length > 0) anySourcesAtAll = true;

      if (items.length === 0) {
        // Finding 3: only claim a retry happened if one actually did - when
        // the run's retry budget was already spent, `retried` is false and
        // this concept got exactly one attempt, so the note must not say
        // otherwise.
        notes.push(
          retried
            ? `Concept "${concept}" returned no candidate resources, even after one retry.`
            : `Concept "${concept}" returned no candidate resources.`
        );
        perConcept[i] = {
          concept,
          sources: sourceCount,
          resolvedSources: resolvedCount,
          candidates: 0,
          droppedPlaceholder: 0,
          droppedUncorroborated: 0,
          droppedDuplicate: 0,
          droppedUnreachable: 0,
          kept: 0,
          retried,
        };
        return;
      }
      if (sources.length === 0) {
        notes.push(`Concept "${concept}"'s search returned no sources, so its candidate resources cannot be corroborated.`);
      }

      const candidates = items.length;

      // B3: reject placeholders before any corroboration or fetch is
      // attempted, and BEFORE verifyItemUrls (see this function's own doc
      // comment above for why the ordering matters for the drop counts).
      const nonPlaceholder: CandidateResourceItem[] = [];
      let conceptDroppedPlaceholder = 0;
      for (const item of items) {
        if (isPlaceholderUrl(item.url)) {
          conceptDroppedPlaceholder++;
        } else {
          nonPlaceholder.push(item);
        }
      }
      droppedPlaceholder += conceptDroppedPlaceholder;

      if (nonPlaceholder.length === 0) {
        perConcept[i] = {
          concept,
          sources: sourceCount,
          resolvedSources: resolvedCount,
          candidates,
          droppedPlaceholder: conceptDroppedPlaceholder,
          droppedUncorroborated: 0,
          droppedDuplicate: 0,
          droppedUnreachable: 0,
          kept: 0,
          retried,
        };
        return;
      }

      // B1: adapter pattern (applyUrlCorroboration in
      // textbook-recommendations.ts:179-199 is the pattern to copy) - map
      // into ParsedTopicItem's shape, corroborate against THIS concept's own
      // (RESOLVED - Y4) sources, then read back only .url/.unverified.
      const asTopicItems: ParsedTopicItem[] = nonPlaceholder.map((item) => ({
        headline: item.title,
        date: "",
        angle: "resource",
        whyItMatters: item.whatYouGet,
        url: item.url,
        background: false,
      }));
      const verified = verifyItemUrls(asTopicItems, sources);

      let conceptDroppedUncorroborated = 0;
      verified.forEach((v, idx) => {
        if (!v.url) {
          conceptDroppedUncorroborated++;
          return;
        }
        survivors.push({ index: i, concept, item: { ...nonPlaceholder[idx], url: v.url } });
      });
      droppedUncorroborated += conceptDroppedUncorroborated;

      // droppedUnreachable/kept are filled in after the reachability check
      // below - every survivor above carries `index` so its concept's entry
      // here can be updated in place once that check resolves.
      perConcept[i] = {
        concept,
        sources: sourceCount,
        resolvedSources: resolvedCount,
        candidates,
        droppedPlaceholder: conceptDroppedPlaceholder,
        droppedUncorroborated: conceptDroppedUncorroborated,
        droppedDuplicate: 0,
        droppedUnreachable: 0,
        kept: 0,
        retried,
      };
    });

    // B2: mirrors current-events.ts:461-471's own check and note wording -
    // a source-less run reads as authoritative while every link on it was
    // necessarily dropped as uncorroborated (an empty source list can never
    // corroborate anything), so it is marked degraded and ships NO links at
    // all rather than a page that looks normally researched.
    const degraded = !anySourcesAtAll;
    if (degraded) {
      notes.push(
        "No web sources were returned for any concept - the model answered without searching, so no links can be shown."
      );
    }

    // Every survivor here already has a non-empty, corroborated url, so
    // degraded (no concept had any source) implies zero survivors - nothing
    // special-cased; the reachability check is simply never reached.
    if (survivors.length === 0) {
      return { links: [], degraded, droppedUncorroborated, droppedPlaceholder, droppedUnreachable: 0, notes, perConcept };
    }

    // Finding E: a model that tags more than one item with the identical
    // source index (or independently writes the identical url twice) can
    // otherwise surface the SAME (concept, url) pair more than once - drop
    // every repeat within a concept BEFORE the reachability call, so a post
    // never shows the same url twice. Keyed by `index` (the concept's
    // position, not its text - two bounded concepts can share the same
    // string) and `item.url`. A dropped repeat is counted separately, in
    // droppedDuplicate (per concept only - see this field's own doc comment
    // in resource-search-outcome.ts) - it was never actually checked for
    // reachability, so it must never inflate droppedUnreachable (the
    // instructor-facing "unreachable: N" count, learning-resources-generator.ts,
    // and the all-dropped "the pages did not open" sentence,
    // discussion-replies.ts, both read that field and would otherwise blame a
    // duplicate on a dead link). Y5's arithmetic is now
    // droppedDuplicate + droppedUnreachable + kept = corroborated survivors.
    const seenByConcept = new Set<string>();
    const dedupedSurvivors = survivors.filter(({ index, item }) => {
      const key = `${index} ${item.url}`;
      if (seenByConcept.has(key)) {
        perConcept[index].droppedDuplicate++;
        return false;
      }
      seenByConcept.add(key);
      return true;
    });

    // B4/Finding 7: the first code path in this repo that actually fetches a
    // candidate URL (Contract 1) - concurrent and bounded under its own
    // total budget, never sequential. Deduped first (the cross-concept case,
    // on top of the per-concept dedupe above): two different concepts can
    // independently surface the same canonical url (a shared official doc,
    // say), and dedupedSurvivors is still per-(concept, item), not per-url -
    // checking every survivor's url would spend the checker's fixed 12s
    // budget rechecking a url it already has an answer for. aliveByUrl is
    // keyed by url regardless, so every survivor - however many concepts
    // share its url - reads back the SAME single check's outcome.
    const uniqueUrls = Array.from(new Set(dedupedSurvivors.map((s) => s.item.url)));
    const reachability = await checkUrlsReachable(uniqueUrls);
    const aliveByUrl = new Map(reachability.map((r) => [r.url, r.alive]));

    let droppedUnreachable = 0;
    const links: ResourceLink[] = [];
    for (const { index, concept, item } of dedupedSurvivors) {
      if (aliveByUrl.get(item.url) !== true) {
        droppedUnreachable++;
        perConcept[index].droppedUnreachable++;
        continue;
      }
      // D2/B5: the link is always the structuring call's extracted
      // publisher url (item.url, already corroborated above) - source.uri
      // (the grounding redirect) is never read again past this point.
      perConcept[index].kept++;
      links.push({ concept, title: item.title, url: item.url, kind: item.kind, whatYouGet: item.whatYouGet });
    }

    return { links, degraded, droppedUncorroborated, droppedPlaceholder, droppedUnreachable, notes, perConcept };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find learning resources." };
  }
}
