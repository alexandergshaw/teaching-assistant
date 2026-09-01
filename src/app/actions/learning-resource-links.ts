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
import { jsonObjectSlice } from "@/lib/json-slice";
import { verifyItemUrls, isPlaceholderUrl, type ParsedTopicItem } from "@/lib/workflows/current-events-report";
import { checkUrlsReachable } from "@/lib/url-reachability";
import { sanitizeResourceUrl } from "@/lib/urls";
import { RESOURCE_KINDS, coerceResourceKind, type ResourceKind } from "@/lib/resource-kind";

const MAX_CONCEPTS_PER_RUN = 6;
const MAX_ITEMS_PER_CONCEPT = 4;
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
const RETRY_BUDGET_MS = 40_000;

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
}

/** A candidate resource before its url has been corroborated or reachability-
 *  checked - never returned to the caller directly, only via ResourceLink. */
interface CandidateResourceItem {
  title: string;
  url: string;
  kind: ResourceLink["kind"];
  whatYouGet: string;
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

/** Oxford-comma join of already-formatted items - `a`, `a or b`,
 *  `a, b, or c` - the ONE joining rule shared by every prompt line in this
 *  file that must enumerate `profile.kinds`, so a future edit to the
 *  separator or the "or" placement cannot land in one line and miss the
 *  others. Every caller below supplies its own per-kind formatting first
 *  (quoted code, or natural-language description) and hands the result
 *  here to be joined. */
function oxfordJoin(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

/** "doc|video|tutorial" - the structuring call's JSON-schema kind
 *  alternation (`:222`), built from `kinds` so it can never drift from
 *  what coerceResourceKind actually accepts. */
function kindSchemaAlternation(kinds: readonly ResourceKind[]): string {
  return kinds.join("|");
}

/** `"doc", "video", or "tutorial"` - the structuring call's prose
 *  enumeration of the same list (`:224`), same ordering, Oxford comma
 *  before the final "or", via the shared oxfordJoin above. */
function kindProseList(kinds: readonly ResourceKind[]): string {
  return oxfordJoin(kinds.map((k) => `"${k}"`));
}

/** A natural-language noun phrase per kind, for the prose call's
 *  description of what it is classifying - never a raw kind code, since
 *  this line reads as English, not JSON. Record<ResourceKind, string> so
 *  adding a sixth kind to the leaf without a phrase here is a compile
 *  error, not a silent gap. */
const KIND_DESCRIPTION: Record<ResourceKind, string> = {
  doc: "official documentation",
  video: "a video tutorial",
  tutorial: "a written tutorial",
  news: "a news article",
  paper: "a paper",
};

/** "official documentation, a video tutorial, or a written tutorial" - the
 *  research call's fourth mention of the allowed kinds (previously a bare
 *  literal a few lines below the resource-type sentence at `:257`; the AC's
 *  R2 named only three locations, but this fourth one tells the model the
 *  same closed set in different words and is exactly the same
 *  coercion-versus-prompt drift risk). Built from the SAME `oxfordJoin`
 *  used by kindProseList, so all four kind-list mentions in this file
 *  trace back to one joining rule and one source array (`profile.kinds`,
 *  itself derived from RESOURCE_KINDS) and cannot drift from each other. */
function kindDescriptionList(kinds: readonly ResourceKind[]): string {
  return oxfordJoin(kinds.map((k) => KIND_DESCRIPTION[k]));
}

// Finding 2: a gate-passing URL can still render as a dead anchor.
// markdownLiteToHtml (src/lib/markdown-lite.ts) turns a survivor into
// `[title](url)` and reuses tokenizeInline's INLINE_LINK_RE
// (src/lib/docx-blocks.ts) to parse it back out. That regex's markdown-link
// branch captures the url as `[^\s)]+` - it stops at the FIRST literal ")"
// or whitespace character, greedy or not. A real, alive, corroborated url
// containing a balanced paren (Wikipedia's own
// ".../Critical_path_method_(project)" is a real page) or an internal space
// (which a real fetch silently percent-encodes before the request, so the
// reachability check sees a 200) truncates at that character, producing a
// dead link plus stray text - exactly the "punctuation baked into the href"
// failure mode src/lib/urls.ts:8-11 attributes 14 of the original 37 dead
// links to. Percent-encoding those characters (and ONLY those - see below)
// makes the emitted url safe inside "[text](url)" syntax while resolving to
// the exact same resource (a server treats "%28"/"%29"/"%20" identically to
// the literal characters they encode).
const RENDER_UNSAFE_URL_CHARS_RE = /[()\s]/g;

function encodeUrlForRenderSafety(url: string): string {
  // Matches only a literal "(", ")", or whitespace character - never a "%",
  // so an already-percent-encoded sequence (e.g. a url that already reads
  // "%28") is never touched and never double-encoded.
  return url.replace(RENDER_UNSAFE_URL_CHARS_RE, (ch) => {
    if (ch === "(") return "%28";
    if (ch === ")") return "%29";
    return "%20";
  });
}

/**
 * Parse the structuring call's {"items":[...]} JSON into candidate resource
 * items, capped at maxItems. Malformed or missing shape degrades to []
 * rather than throwing - a parse miss becomes an empty result the caller
 * treats as a failed attempt, mirroring parseTopicItems /
 * parseTextbookRecommendations.
 *
 * Every url is run through sanitizeResourceUrl (src/lib/urls.ts:224-237)
 * FIRST, on the raw model-supplied string, so its trailing-punctuation and
 * unmatched-bracket cleanup still sees the real trailing characters -
 * percent-encoding a trailing ")" before that check would hide it from the
 * exact heuristic designed to catch it. Only what survives is then
 * percent-encoded for render-safety (Finding 2, encodeUrlForRenderSafety
 * above). An item whose url does not survive sanitizeResourceUrl (empty,
 * not http(s)) is dropped outright, same as an item with no title.
 */
function parseResourceItems(text: string, maxItems: number): CandidateResourceItem[] {
  const jsonText = jsonObjectSlice(text);
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText) as { items?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((raw) => {
        const sanitizedUrl = sanitizeResourceUrl(String(raw.url ?? ""));
        return {
          title: String(raw.title ?? "").trim(),
          url: sanitizedUrl ? encodeUrlForRenderSafety(sanitizedUrl) : "",
          kind: coerceResourceKind(raw.kind),
          whatYouGet: String(raw.whatYouGet ?? "").trim(),
        };
      })
      .filter((item) => item.title.length > 0 && item.url.length > 0)
      .slice(0, maxItems);
  } catch {
    return [];
  }
}

/**
 * Call 2 of the two-call shape: convert call 1's grounded prose into the
 * fixed {"items":[...]} JSON, with NO web search - see the module doc
 * comment for why this instruction must never appear alongside
 * webSearch: true. Throws on a call failure so researchConceptWithRetry can
 * catch it and retry the whole pair, mirroring
 * current-events.ts's structureProseIntoItems.
 */
async function structureProseIntoResourceItems(
  prose: string,
  provider: LlmProvider,
  profile: ResourceProfile
): Promise<CandidateResourceItem[]> {
  if (!prose.trim()) return [];

  const prompt = `Convert the following research notes into structured JSON. Use only information present in the notes below - do not add, invent, look up, or infer anything that isn't already stated there.

RESEARCH NOTES:
${prose.slice(0, PER_CONCEPT_STRUCTURE_INPUT_CHAR_CAP)}

Return ONLY valid JSON in this exact shape:
{"items":[{"title":"...","url":"...","kind":"${kindSchemaAlternation(profile.kinds)}","whatYouGet":"..."}]}

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

  return parseResourceItems(result.text, MAX_ITEMS_PER_CONCEPT);
}

/**
 * Call 1 of the two-call shape: a grounded (webSearch: true) call that asks
 * for a browsable prose answer, never JSON - see the module doc comment for
 * why. Throws on a transport failure so researchConceptWithRetry can retry
 * the whole pair, mirroring current-events.ts's researchTopicOnce.
 */
async function researchConceptOnce(
  concept: string,
  courseKind: string,
  provider: LlmProvider,
  profile: ResourceProfile
): Promise<{ items: CandidateResourceItem[]; sources: Source[] }> {
  const kindLabel = courseKind.trim() ? ` for a ${courseKind.trim()} course` : "";
  // Video-length-preference setting (discussion-reply resources feature):
  // appended verbatim, never reworded here - see ResourceProfile.extraGuidance's
  // own doc comment for why this must stay a stated preference. "" (the
  // common case - every existing caller) leaves the template literal below
  // byte-identical to before this field existed.
  const guidance = profile.extraGuidance ? `\n\n${profile.extraGuidance}` : "";
  const prompt = `You are an expert educator finding learning resources${kindLabel} for a student studying one concept.

CONCEPT: ${concept}

Search the web first, then report up to ${MAX_ITEMS_PER_CONCEPT} real resources for a student learning this concept: ${profile.resourceTypeSentence}, appropriate to the course level.

For each resource you find, write a short paragraph in plain prose giving: the resource's title, whether it is ${kindDescriptionList(profile.kinds)}, the exact URL of the page you visited to find it, and one sentence on what a student gets from it.${guidance}

If a web search turns up nothing relevant for this concept, say so plainly instead of inventing a resource.`;

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

  const sources = grounded.sources ?? [];
  const items = await structureProseIntoResourceItems(grounded.text, provider, profile);

  return { items, sources };
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
 */
async function researchConceptWithRetry(
  concept: string,
  courseKind: string,
  provider: LlmProvider,
  hasRetryBudget: () => boolean,
  profile: ResourceProfile
): Promise<{ items: CandidateResourceItem[]; sources: Source[]; retried: boolean }> {
  try {
    const first = await researchConceptOnce(concept, courseKind, provider, profile);
    if (first.items.length > 0 || !hasRetryBudget()) return { ...first, retried: false };
    const second = await researchConceptOnce(concept, courseKind, provider, profile);
    return { ...second, retried: true };
  } catch (err) {
    if (!hasRetryBudget()) throw err;
    const second = await researchConceptOnce(concept, courseKind, provider, profile);
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
 *      (verifyItemUrls, current-events-report.ts:170-217) and is not a
 *      placeholder (isPlaceholderUrl). Either failure DROPS the item outright
 *      (B1/B3) rather than rendering it "unverified" - this page is a list of
 *      links, so a blanked link has nothing left to be.
 *   3. It resolves (checkUrlsReachable, src/lib/url-reachability.ts,
 *      Contract 1) - anything not alive is dropped (B4).
 *
 * Placeholder and corroboration failures are counted SEPARATELY
 * (droppedPlaceholder vs droppedUncorroborated) even though verifyItemUrls
 * itself blanks both the same way (it calls isPlaceholderUrl internally -
 * current-events-report.ts:205) - if placeholder candidates were passed into
 * verifyItemUrls, its output would make the two failure reasons
 * indistinguishable. So isPlaceholderUrl is checked FIRST, here, on the raw
 * candidate list; only genuine non-placeholder candidates are handed to
 * verifyItemUrls, so anything IT blanks can only be a real URL that failed
 * corroboration. The instructor needs to know WHY a concept came back
 * linkless, and this is what keeps the three counts meaningful and disjoint.
 *
 * D2/B5 (a Gemini grounding redirect host must never be the link on the
 * page): guaranteed structurally, not by a separate filter. verifyItemUrls's
 * own isCorroborated check (current-events-report.ts:196-202) always returns
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
  // than RETRY_BUDGET_MS without waiting for the real one to elapse. Neither
  // field is meant to be passed by a real caller - both default to the real
  // clock and the real budget - so every existing 3-argument call site (the
  // sibling generator's call in lms-generation.ts) is unaffected.
  options?: { now?: () => number; retryBudgetMs?: number },
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

    const notes: string[] = [];
    const settled = await Promise.allSettled(
      boundedConcepts.map((concept) =>
        researchConceptWithRetry(concept, courseKind ?? "", provider, hasRetryBudget, profile)
      )
    );

    let anySourcesAtAll = false;
    let droppedPlaceholder = 0;
    let droppedUncorroborated = 0;
    const survivors: Array<{ concept: string; item: CandidateResourceItem }> = [];

    settled.forEach((outcome, i) => {
      const concept = boundedConcepts[i];

      if (outcome.status === "rejected") {
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        notes.push(`Concept "${concept}" failed: ${reason}`);
        return;
      }

      const { items, sources, retried } = outcome.value;
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
        return;
      }
      if (sources.length === 0) {
        notes.push(`Concept "${concept}"'s search returned no sources, so its candidate resources cannot be corroborated.`);
      }

      // B3: reject placeholders before any corroboration or fetch is
      // attempted, and BEFORE verifyItemUrls (see this function's own doc
      // comment above for why the ordering matters for the drop counts).
      const nonPlaceholder: CandidateResourceItem[] = [];
      for (const item of items) {
        if (isPlaceholderUrl(item.url)) {
          droppedPlaceholder++;
        } else {
          nonPlaceholder.push(item);
        }
      }
      if (nonPlaceholder.length === 0) return;

      // B1: adapter pattern (applyUrlCorroboration in
      // textbook-recommendations.ts:179-199 is the pattern to copy) - map
      // into ParsedTopicItem's shape, corroborate against THIS concept's own
      // sources, then read back only .url/.unverified.
      const asTopicItems: ParsedTopicItem[] = nonPlaceholder.map((item) => ({
        headline: item.title,
        date: "",
        angle: "resource",
        whyItMatters: item.whatYouGet,
        url: item.url,
        background: false,
      }));
      const verified = verifyItemUrls(asTopicItems, sources);

      verified.forEach((v, idx) => {
        if (!v.url) {
          droppedUncorroborated++;
          return;
        }
        survivors.push({ concept, item: { ...nonPlaceholder[idx], url: v.url } });
      });
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
      return { links: [], degraded, droppedUncorroborated, droppedPlaceholder, droppedUnreachable: 0, notes };
    }

    // B4/Finding 7: the first code path in this repo that actually fetches a
    // candidate URL (Contract 1) - concurrent and bounded under its own
    // total budget, never sequential. Deduped first: two different concepts
    // can independently surface the same canonical url (a shared official
    // doc, say), and survivors is per-(concept, item), not per-url - checking
    // every survivor's url would spend the checker's fixed 12s budget
    // rechecking a url it already has an answer for. aliveByUrl is keyed by
    // url regardless, so every survivor - however many concepts share its
    // url - reads back the SAME single check's outcome.
    const uniqueUrls = Array.from(new Set(survivors.map((s) => s.item.url)));
    const reachability = await checkUrlsReachable(uniqueUrls);
    const aliveByUrl = new Map(reachability.map((r) => [r.url, r.alive]));

    let droppedUnreachable = 0;
    const links: ResourceLink[] = [];
    for (const { concept, item } of survivors) {
      if (aliveByUrl.get(item.url) !== true) {
        droppedUnreachable++;
        continue;
      }
      // D2/B5: the link is always the structuring call's extracted
      // publisher url (item.url, already corroborated above) - source.uri
      // (the grounding redirect) is never read again past this point.
      links.push({ concept, title: item.title, url: item.url, kind: item.kind, whatYouGet: item.whatYouGet });
    }

    return { links, degraded, droppedUncorroborated, droppedPlaceholder, droppedUnreachable, notes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find learning resources." };
  }
}
