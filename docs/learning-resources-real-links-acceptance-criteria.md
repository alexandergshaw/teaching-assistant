# Learning Resources: real, verified links to docs, videos and tutorials

A revision of the shipped "Learning resources" generation kind
(`docs/learning-resources-page-acceptance-criteria.md`, REGRESSION entry 322).
That version deliberately emitted NO links. This one links out to official
documentation, YouTube videos and tutorials for the concepts in the selected
items - sourced from real web search, corroborated against the search's own
grounding metadata, and reachability-checked before they reach the page.

## What changes, and why the first version did not do this

The shipped generator's core contract is "never include a link at all," and
`stripModelUrls` runs over every output including the embedded scaffold. That
was not caution for its own sake: `src/lib/urls.ts:8-11` records the incident
behind it - a generated course shipped **37 dead links out of 73**. Asking a
model to recall a URL produces plausible, confidently-wrong links at roughly
that rate.

The instructor has asked for links anyway, which is their call. This document
is therefore not "turn the stripping off" - it is "get the links from
somewhere that can actually be checked, and check them." Three independent
gates stand between a model and a link on the page:

1. **The link must come from a real web search.** Gemini grounding
   (`webSearch: true`) returns the sources it actually consulted.
2. **The link must be corroborated by those sources.** `verifyItemUrls`
   already implements exactly this host-matching check.
3. **The link must resolve.** A bounded reachability check - the first code
   path in this repo that actually fetches a candidate URL.

Anything failing any gate is dropped, not downgraded.

## What already exists (reuse survey - vetted, do not rebuild)

| Need | Existing code | Where |
| --- | --- | --- |
| A grounded (real web search) LLM call | `callLlm({ contents, generationConfig, webSearch: true }, provider)` | `src/lib/llm.ts:45-52, 232-243`; Gemini maps it to `tools: [{ google_search: {} }]` at `:279-311` |
| The sources the search actually returned | `LlmResult.sources?: Source[]`, `Source { title, uri }`, parsed from `groundingMetadata.groundingChunks` | `src/lib/llm.ts:111-114, 121-155` |
| **The two-call split that makes search actually happen** | `researchTopicOnce` (grounded prose, no JSON instruction) then `structureProseIntoItems` (ungrounded, returns JSON) | `src/app/actions/current-events.ts:98-105, 106-196` |
| Per-item corroboration against grounding sources | `verifyItemUrls(items, sources)` - blanks and flags any item whose URL host is not corroborated | `src/lib/workflows/current-events-report.ts:170-217` |
| Adapting a different item shape into that function | `applyUrlCorroboration` - the adapter pattern to copy | `src/lib/textbook-recommendations.ts:179-199` |
| "The model answered from memory" detection | `dedupedSources.length === 0` -> `degraded` + an explicit note | `src/app/actions/current-events.ts:461-471` |
| Placeholder-URL rejection | `isPlaceholderUrl` (example.com, localhost, bare IPs) | `src/lib/workflows/current-events-report.ts:101-118` |
| Source dedupe | `dedupeSourcesByUrl` | `src/lib/workflows/current-events-report.ts:308-317` |
| Syntactic URL cleanup | `sanitizeResourceUrl` | `src/lib/urls.ts:224-237` |
| Rendering a link as clickable markdown | `sourceLinkMarkdown`'s `[title](uri)` shape | `src/lib/workflows/current-events-report.ts:427-433` |
| Flattening markdown for a Canvas page | `buildCurrentEventsPageText` | `src/lib/workflows/current-events-page-text.ts:56-70` |
| Stripping model-invented URLs from prose | `stripModelUrls` (fence-aware) | `src/lib/urls.ts:165-178` |
| Parallel fan-out with retry-once, inside the 60s ceiling | `researchTopicWithRetry` + `Promise.allSettled` | `src/app/actions/current-events.ts:206-220, 409-411` |

Genuinely new: the per-concept resource prompt and its JSON parser, the
concepts-per-run clamp, and the reachability checker (nothing in this repo
fetches a candidate URL today - confirmed, zero `HEAD` requests in `src/`).

## Decisions

**D1. Two calls per concept, never one.** The grounded call asks for prose and
carries NO JSON instruction; a second, ungrounded call structures that prose
into items. `current-events.ts:98-105, 140-150` documents why: pairing "return
only valid JSON" with `webSearch: true` in one call reliably makes Gemini skip
the search and answer from memory. A single-call implementation would look
identical, pass every test that does not inspect sources, and reintroduce the
dead-link failure wholesale.

**D2. Never surface `source.uri` as the link.** Gemini's grounding `uri` is
almost always a `vertexaisearch.cloud.google.com/grounding-api-redirect/...`
address, not the publisher's URL. The real domain typically appears in
`source.title`. `verifyItemUrls` already excludes that redirect host from the
corroboration set precisely so a fabricated URL cannot self-corroborate
through it. The link on the page is the publisher URL the structuring call
extracted, corroborated against those hosts.

**D3. Reachability is checked, and failure is fail-CLOSED.** A corroborated
URL proves the host appeared in the search's sources - not that the page
exists. Each surviving candidate is fetched (HEAD, falling back to GET when a
server rejects HEAD) with a short per-request timeout. 2xx/3xx survives.
4xx/5xx, a network error, or a timeout drops the link. A "maybe dead" link is
worth less than no link, because the instructor cannot tell which is which.

**D4. Prose is still stripped.** `stripModelUrls` continues to run over every
prose section of the page. Links may appear ONLY in the structured resources
list, where all three gates apply. This keeps the shipped behaviour for
everything except the one section that is now allowed to carry a link, so a
model slipping a URL into a sentence still cannot get it onto the page.

**D5. The embedded provider emits no links at all.** It makes no network call,
so it can neither search nor verify. It short-circuits to the existing
deterministic scaffold, unchanged, still URL-stripped. The page it produces is
honest about having no external resources rather than inventing them.

**D6. Bounded work per run.** Prod is Vercel Hobby with a hard 60s ceiling and
this runs from a Server Action behind a button. Concepts per run are clamped,
lookups fan out with `Promise.allSettled` rather than running sequentially,
per-call `maxOutputTokens` stays small, and the reachability checks run
concurrently with their own total budget.

## Fixed contracts (three file sets are built concurrently against these)

### Contract 1 - the reachability checker: `src/lib/url-reachability.ts` (NEW, set A)

The first code path in this repo that actually fetches a candidate URL.
`fetchImpl` is injected so every outcome is testable with no network.

```ts
export const REACHABILITY_TIMEOUT_MS = 3000;
export const REACHABILITY_MAX_CONCURRENT = 6;
export const REACHABILITY_TOTAL_BUDGET_MS = 12000;

export type ReachabilityReason = "ok" | "client-error" | "server-error" | "network" | "timeout" | "budget";

export interface ReachabilityResult {
  url: string;
  /** FAIL-CLOSED: anything other than a confirmed 2xx/3xx is false (D3). */
  alive: boolean;
  status?: number;
  reason: ReachabilityReason;
}

/** Minimal structural subset of `fetch` this module needs - injected so the
 *  tests never touch the network. */
export type ReachabilityFetch = (
  url: string,
  init: { method: "HEAD" | "GET"; redirect: "follow"; signal: AbortSignal }
) => Promise<{ status: number }>;

/** HEAD first; retry once with GET when a server rejects HEAD (405/501).
 *  2xx/3xx -> alive. 4xx/5xx, network error, timeout, and exhausted total
 *  budget -> not alive. Concurrent, bounded, and NEVER throws. */
export async function checkUrlsReachable(
  urls: readonly string[],
  fetchImpl?: ReachabilityFetch,
  options?: { timeoutMs?: number; maxConcurrent?: number; totalBudgetMs?: number; now?: () => number }
): Promise<ReachabilityResult[]>;
```

### Contract 2 - the grounded link finder: `src/app/actions/learning-resource-links.ts` (NEW, set B)

```ts
"use server";

export interface ResourceLink {
  concept: string;
  title: string;
  url: string;
  kind: "doc" | "video" | "tutorial";
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

export async function findResourceLinksForConceptsAction(
  concepts: readonly string[],
  courseKind?: string,
  provider?: LlmProvider
): Promise<FindResourceLinksSuccess | { error: string }>;
```

### Contract 3 - the generator revision (set C)

`generateLearningResourcesForSelection` keeps its existing signature exactly
(`moduleLabel, materialsText, provider?, courseKind?` ->
`{ text } | { error }`) so `lms-generation.ts`'s `case "resources":` needs no
change. Internally it now: generates the prose page as it does today and
strips it (D4); derives a bounded concept list from the materials; calls
Contract 2; and appends a Resources section rendering only the links that
survived. Set C owns the concept-derivation step.

## Acceptance criteria

### A. Getting real candidates

**A1.** Concepts are derived from the gathered materials of the selected
items, and clamped to a documented per-run maximum before any search runs.

**A2.** Each concept's resources come from a grounded call
(`webSearch: true`) whose prompt asks for official documentation, video
tutorials and written tutorials appropriate to the course kind, and carries
no JSON instruction (D1).

**A3.** A second, ungrounded call structures that prose into items of a fixed
shape: title, url, kind (`doc` | `video` | `tutorial`), and a one-line
statement of what the student gets from it.

**A4.** Concept lookups run concurrently, with at most one retry for a
concept whose call fails or yields nothing (D6).

### B. Proving the links are real

**B1.** Every candidate URL is corroborated with `verifyItemUrls` against the
grounding sources from its own concept's call. An uncorroborated URL is
DROPPED, not rendered unverified - this page is a list of links, so an entry
whose link has been blanked has nothing left to be.

**B2.** When a concept's grounded call returns NO sources at all, that
concept contributes no links, and the run records why. When NO concept
returned sources, the whole run is reported as degraded with the explicit
"the model answered without searching" note (mirroring
`current-events.ts:461-471`), and the page carries no links at all.

**B3.** `isPlaceholderUrl` rejects example.com-style, localhost and bare-IP
URLs before any fetch is attempted.

**B4.** Every surviving URL is reachability-checked (D3): HEAD, falling back
to GET when HEAD is rejected; 2xx/3xx survives; 4xx/5xx, network error and
timeout all drop the link. Checks run concurrently under a total budget.

**B5.** A Gemini grounding redirect host never appears as a link on the page
(D2).

**B6.** The page states, per resource, nothing that was not verified. There
is no "unverified" tier: a link is on the page or it is not.

### C. The page

**C1.** Links render as clickable markdown (`[title](url)`) so
`markdownLiteToHtml` turns them into real anchors in the Canvas page, grouped
by concept, and labelled by kind so a student can tell a video from a doc.

**C2.** Every prose section still passes through `stripModelUrls` (D4).

**C3.** A concept for which no link survived is still listed, with its
non-link resources (what to review, practice, search terms) intact - the
shipped feature's value does not regress when search finds nothing.

**C4.** The embedded provider path is unchanged and link-free (D5).

**C5.** The result reports counts the instructor can act on: how many
concepts were searched, how many links survived, and how many were dropped at
each gate (uncorroborated, placeholder, unreachable).

### D. Tests

**D1t.** The two-call split is pinned: a test asserts the grounded call
carries `webSearch: true` and NO JSON instruction, and that structuring
happens in a separate call without `webSearch`. This is the property whose
silent loss reintroduces the original defect.

**D2t.** A grounded response with no sources produces no links and the
degraded note - modelled on `current-events.test.ts:224-244`.

**D3t.** An uncorroborated URL is dropped, and the fabricated URL string does
not appear anywhere in the output.

**D4t.** A grounding redirect host is never emitted as a link.

**D5t.** The reachability checker is tested against a mocked fetch for each
outcome: 200 survives, 301 survives, 404 drops, 500 drops, timeout drops,
network error drops, and HEAD-rejected-then-GET-200 survives.

**D6t.** The embedded path emits no URL, with a fixture whose materials
CONTAIN a URL (the shipped test for this used a URL-free fixture and could
not have failed).

**D7t.** Prose sections are still stripped even when the resources list
carries links.

**D8t.** Tests pin facts and ordering, never prose spelling, and every new
test is verified to be able to fail.

## Honest limits (to be carried into the REGRESSION entry)

- **A 200 is not proof a resource is good.** YouTube in particular returns 200
  for a removed-video page, so a dead video can pass the reachability gate.
  The gate removes the large majority of dead links (404/500/DNS failures); it
  does not make the list curated.
- Corroboration proves a host appeared in that call's grounding metadata, not
  that the specific deep link was the page the search actually read.
- Links are verified at generation time only. Nothing re-checks them later,
  and link rot begins immediately.
- Grounding is Gemini-only. `callLlm` currently routes every provider to
  Gemini, so `webSearch: true` reaches search today regardless of the selected
  provider - but nothing in the type system enforces that, and a future
  non-Gemini path would silently produce ungrounded answers. B2's no-sources
  detection is what catches that, and it is the only thing that would.

## Sequencing

This revises a shipped feature. It starts after the in-flight visualizer
chunk (`docs/visualizer-coverage-from-selection-acceptance-criteria.md`) is
pushed. Its only overlap with that work is none: it touches
`learning-resources-generator.ts` and new files.
