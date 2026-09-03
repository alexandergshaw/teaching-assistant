# Reply resource search: make it return something most of the time

Owner report (2026-09-03): "the resources search returns something the
minority of the time, leading me to have to reprompt or manually search."
The attached run log (discussion-replies-log-introduction-to-cybersecurity-
rize-20260903-201153) shows two batches, both with the notice "Some resource
results could not be fully gathered for this batch and may be incomplete",
and a row whose `resourceState` is `done` with an empty `resourceError` and
no resources - three concept terms went out as one query and nothing came
back, with no explanation anywhere.

Revision 5 (after the architect, UX and data-engineer passes). Baseline:
docs/REGRESSION.md, "2026-09-03 - Discussion reply resource search (yield)".

## 0. Diagnosis (code-path survey, no live probe - there is no local key)

The search pipeline is `gatherReplyResourcesAction` (discussion-replies.ts)
-> `findResourceLinksForConceptsAction` (learning-resource-links.ts). Every
link must clear four gates, and each gate is lossy in a way that compounds:

1. **The model has to decide to search.** Call 1 sends `tools:
   [{google_search:{}}]` and asks the model to "Search the web first". Whether
   Google Search actually runs is at the model's discretion, and the lite
   tier is the most tool-shy. When it does not run, the response has no
   `groundingChunks`, `sources` is `[]`, and EVERY candidate for that concept
   is dropped as uncorroborated - an empty source list can never corroborate
   anything. That is exactly what the log shows: the notice text is the
   client's rendering of `degraded: true`, which means NOT ONE concept in the
   batch returned a single source. Both batches. The one retry that exists
   (`researchConceptWithRetry`) fires only on `items.length === 0` - a
   memory-answer that produced items but no sources is never retried, so the
   most common failure gets exactly one attempt.
2. **The link must be a URL the model typed.** The grounded prose is asked
   for "the exact URL of the page you visited". A grounded Gemini answer sees
   search snippets, not URLs; the model writes a plausible path on a real
   domain. The pages the search actually visited are in
   `groundingChunks[].web.uri`, but every one of those is a
   `vertexaisearch.cloud.google.com/grounding-api-redirect/...` link, which
   the pipeline (correctly) refuses to treat as a publisher URL and never
   resolves. The one set of URLs that is verified by construction is never a
   candidate.
3. **Corroboration is host-only, and only via titles.** `verifyItemUrls`
   builds its host set from source URIs (all redirect-host, all excluded) and
   from `web.title` when the title is domain-shaped (which it usually is).
   A page-shaped title (occasionally emitted) contributes nothing, and the
   `web.domain` field Gemini also returns is never read.
4. **Reachability then drops the fabricated path.** A hallucinated path on a
   corroborated domain 404s (or soft-200s and ships dead).

And nothing reports any of it: `FindResourceLinksSuccess.notes` and the three
drop counts are discarded by `gatherReplyResourcesAction`; the row lands as
`done` with `resources: []` and `resourceError: ""`; the only user-visible
signal is one generic sentence per batch; and `Find resources (N)` excludes
every such row, so retrying 25 empty rows costs 25 clicks.

## 1. Goal

A drafted reply gets real, verified links most of the time, and when it does
not, the row says why in one line and one click retries every empty row.

## 2. Group A - server search core

Files (Group A owns ALL of these and nothing else):
`src/lib/grounding-sources.ts` (NEW) + `src/lib/grounding-sources.test.ts`
(NEW); `src/app/actions/learning-resource-links.ts` + `.test.ts`;
`src/app/actions/learning-resources-generator.test.ts` (fixture only);
`src/lib/workflows/current-events-report.ts` + its test (redirect-host
predicate import and `domain` in `verifyItemUrls` ONLY); `src/lib/llm.ts`
+ `src/lib/llm.test.ts`; `src/lib/gemini.ts` + `src/lib/gemini.test.ts`;
`README.md` (one env-table line).

- **Y1a - Read `web.domain`.** `Source` (llm.ts) gains `domain?: string`.
  `parseGroundingSources` copies `chunk.web.domain` when it is a non-empty
  string; every existing consumer is unaffected (optional field).
  `verifyItemUrls` adds a normalized non-empty `source.domain` to
  `domainHosts` (never when it is the redirect host). Zero fetches.
- **Y1 - Resolve the grounding redirects.** New leaf
  `src/lib/grounding-sources.ts` that OWNS `GROUNDING_REDIRECT_HOST` and
  `isGroundingRedirectHost` (moved out of current-events-report.ts, which now
  imports them - leaf-ward, no cycle; the predicate's logic is unchanged and
  `verifyItemUrls`'s existing tests still pass). It exports
  `createGroundingResolver(options)` returning `{ resolve(sources):
  Promise<Source[]> }` - ONE resolver per run, shared by every concept:
  one worker pool (`maxConcurrent` default 6, TOTAL across concepts), one
  wall-clock budget (`totalBudgetMs` default 5000, started when the resolver
  is created), one `Map<uri, Source>` cache so a URI resolved for one concept
  is free for the next, and a per-request `timeoutMs` (default 3000). For
  each source whose host is the redirect host: fetch with `redirect:
  "manual"`, an explicit `User-Agent` and `Accept` header, accept ONLY status
  301/302/303/307/308 with a `Location`, resolve a relative `Location`
  against the request URL, and return `{ ...source, uri: <resolved> }`.
  Discard the response body on every other status. A source stays UNCHANGED
  (never dropped) when: it is not on the redirect host; the fetch throws,
  times out, or the budget is spent; the status is not one of the five; the
  `Location` is missing, not http(s), or its host is the redirect host or
  `news.google.com`. Injectable `fetchImpl` and `now` (precedent:
  `url-reachability.ts`; the manual-redirect + `headers.get("location")`
  reading precedent is `ghRedirectLocation` in `src/lib/github.actions.ts`).
  Copy `checkUrlsReachable`'s worker-pool shape, NOT its `ReachabilityFetch`
  type (it hard-codes `redirect: "follow"`).
  Vendor assumption, UNVERIFIED locally: the endpoint answers a plain GET
  with a 3xx and `Location`. If it answers 200/403/429 instead, every source
  stays unchanged and the pipeline behaves exactly as today plus Y1a.
- **Y2 - The structuring call gets the visited pages.** `researchConceptOnce`
  takes the run's resolver, resolves the grounded call's sources BEFORE the
  structuring call, and appends a numbered `SOURCES VISITED BY THE SEARCH`
  list (index, title, resolved URL - only sources that actually resolved to
  a non-redirect host are listed) to the structuring prompt, with the
  instruction that each item carry `"source": <index>` when the resource IS
  one of those pages, else `null`, and that a URL written in the notes must
  not be altered. `parseResourceItems` gains a `sourceUrls: string[]`
  parameter: a valid in-range integer `source` REPLACES the item's `url`
  with that resolved URL (then `sanitizeResourceUrl` +
  `encodeUrlForRenderSafety` exactly as today); anything else leaves the
  model's own `url`. With zero resolved sources the structuring prompt is
  byte-identical to today's (the `? ... : ""` pattern already used for
  `extraGuidance`).
- **Y3 - Retry when the model did not search.** `researchConceptWithRetry`
  retries (budget permitting, exactly as today) when the first attempt
  returned NO SOURCES, not only when it returned no items. The retry's
  research prompt is today's prompt with one leading line and a blank line:
  "Use the Google Search tool for this request. Do not answer from memory."
  The FIRST attempt's prompt is byte-identical to today's. `retried`
  semantics unchanged; "even after one retry" only when a retry ran.
  `RETRY_BUDGET_MS` drops from 40 000 to 32 000 (a retry that starts late
  plus Y1's round plus the 12 s reachability budget must fit under 60 s).
- **Y4 - Corroboration sees real hosts.** `verifyItemUrls` is called with
  the RESOLVED sources (Y1) which also carry `domain` (Y1a). The
  redirect-host exclusion inside `verifyItemUrls` is untouched.
- **Y5 - Per-concept accounting.** `FindResourceLinksSuccess` gains a
  REQUIRED `perConcept: ConceptOutcome[]`, one entry per bounded concept in
  input order, where `ConceptOutcome = { concept: string; sources: number;
  resolvedSources: number; candidates: number; droppedPlaceholder: number;
  droppedUncorroborated: number; droppedUnreachable: number; kept: number;
  retried: boolean; failed?: string }` (exported type). Arithmetic, per
  concept c: `failed` set => every count 0; `candidates = items.length`
  after `parseResourceItems`; `droppedPlaceholder + nonPlaceholder =
  candidates`; `droppedUncorroborated + survivors = nonPlaceholder`;
  `droppedDuplicate + droppedUnreachable + kept = survivors` (a survivor
  deduped as a same-concept repeat of an earlier url is counted in
  `droppedDuplicate`, per concept only - it never reaches the top-level
  `droppedUnreachable`, since it was never actually checked for
  reachability). Counts are over (concept, item)
  pairs, not distinct URLs - a URL shared by two concepts is counted once
  per concept, exactly as the top-level counts already are. Top-level counts
  equal the per-concept sums; `sum(kept) === links.length`. `notes`
  unchanged. Fixtures that build a `FindResourceLinksSuccess` literal
  (`learning-resources-generator.test.ts`) gain `perConcept: []`.
- **Y6 - A search-specific model override.** `gemini.ts` gains
  `getGeminiSearchModel()` = `process.env.GEMINI_SEARCH_MODEL ??
  getGeminiModel()`. In `llm.ts`, `callGemini`'s EXISTING top-of-function
  `const model = getGeminiModel()` becomes `req.webSearch ?
  getGeminiSearchModel() : getGeminiModel()`; nothing else moves - that
  one `model` already flows into both `normalizeGenerationConfig` and
  `postGenerateContent`, which is what keeps a 2.5 search model from
  receiving Gemini 3 `thinkingConfig`. With the variable unset every
  request is byte-identical to today. README env table, right after `GEMINI_MODEL`:
  `GEMINI_SEARCH_MODEL` (optional, default: the `GEMINI_MODEL` value; used
  only for web-search-grounded calls; `gemini-2.5-flash` is the recommended
  value when the lite model keeps answering without searching).
- **Y7 - Budget.** Y1 costs at most 5 s per RUN (one shared budget, one
  shared pool), not per attempt or per concept. No other timing constant
  changes except Y3's `RETRY_BUDGET_MS`.

## 3. Group B - discussion feature

Files (Group B owns ALL of these and nothing else):
`src/app/actions/discussion-replies.ts` + `discussion-replies-resources.
test.ts` + `discussion-replies-bulk-redaction.test.ts` (fixture only);
`src/app/components/recording/useReplyResources.ts` + `.test.ts`;
`useReplyRowResourceMutators.ts` + `useReplyRowResourceMutators.test.ts`
(NEW);
`useReplyRows.ts`; `discussion-serialization.ts` + `.test.ts`;
`discussion-replies-log.ts` + `.test.ts`; `DiscussionReplyResources.tsx`;
`DiscussionReplyRow.tsx` (prop plumbing only); `DiscussionReplyToolbar.tsx`
(only if the Y13 count wording needs it); `discussion-capture.resources.
test.ts`; `discussionReplyResources.wiring.test.ts`; `resourceQuery.wiring.
test.ts`.

Group B codes against Group A's `ConceptOutcome` type and `perConcept`
field exactly as written in Y5; its own tests mock
`findResourceLinksForConceptsAction`, so they run green before Group A
lands, and `tsc` is gated on the whole wave.

- **Y8 - The action explains an empty result.** `gatherReplyResourcesAction`
  dedupes concept strings (trimmed) before the call and returns, per post,
  `outcome?: { kind: ResourceSearchOutcomeKind; text: string; counts:
  ResourceSearchCounts }`, ABSENT when `resources` is non-empty, where
  `ResourceSearchOutcomeKind = "failed" | "no-sources" | "no-candidates" |
  "all-dropped" | "unknown"` (`all-dropped` applies only when `kept ===
  0`; when `kept > 0` but the post still has no resources - every kept
  link was a deselected kind, dropped by this action's own result-side
  filter - the kind is `unknown`) and `ResourceSearchCounts = Pick<ConceptOutcome,
  "sources" | "resolvedSources" | "candidates" | "droppedPlaceholder" |
  "droppedUncorroborated" | "droppedUnreachable" | "kept" | "retried">`
  (all owned by the neutral leaf `src/lib/resource-search-outcome.ts`,
  together with `ConceptOutcome` and the frozen `ZERO_RESOURCE_SEARCH_COUNTS`;
  the two "use server" actions and the client row leaf all import from it,
  and `discussion-serialization.ts` re-exports the outcome types for its
  existing importers). The entry is the FIRST
  `perConcept` entry whose `concept` equals that post's value in the
  action's existing `conceptById` map (the redacted, derived concept string
  actually sent) - two posts sharing a concept always share resources and
  outcome, the slice is deterministic. `text` is exactly one of (each under 90
  characters, "Search for resources" is the row button's exact label):
  - `failed`: `The search failed: {reason}` where reason is the first
    sentence of `failed`, clamped to 60 characters.
  - `no-sources` (`sources === 0`): `No web pages came back this time.
    Search for resources again - it usually works.` ("searched" is
    reserved for the row's own "Searched the post text" line)
  - `no-candidates` (`candidates === 0`): `Pages were searched, but none
    matched these terms. Editing the reply changes the terms.`
  - `all-dropped`, `droppedUnreachable > 0 && droppedUnreachable >=
    droppedUncorroborated`: `Found {N} links, but the pages did not open.
    Search for resources again.` (N = candidates; a concept whose candidates
    were all placeholders never fetched anything, so it takes the next
    branch)
  - `all-dropped`, otherwise: `Found {N} links, but none traced back to a
    real site. Editing the reply changes the terms.`
  - `unknown`, `kept > 0`: `Links were found, but not in the resource kinds
    you picked in <the Resources settings block's visible label>.`
  - `unknown` (no entry): `No links came back for these terms.`
  The embedded-provider and empty-kinds short-circuits set no outcome, and
  neither does a post whose derived concept is EMPTY (nothing was searched,
  nothing to explain - and an outcome would make it eligible for the Y13
  sweep forever). The
  `degraded` flag is still returned unchanged.
- **Y9 - The row remembers why.** `ReplyRow` gains `resourceSearchOutcome?:
  { kind; text; counts }` (same shape as Y8's `outcome`). Persisted; absent
  stays absent: the serializer spreads the row and needs NO change; the
  deserializer's explicit object gains it with shape coercion (a malformed
  value is dropped, never thrown on); the frozen serialization oracle is
  unchanged; `DISCUSSION_TABLE_VERSION` unchanged. `applyResources(id,
  resources, outcome?)` stores `outcome` when `resources` is empty and
  CLEARS the field when `resources` is non-empty; `markResourceSearching`
  and `markResourceFailed` clear it; a hand edit that clears `concepts`
  leaves it alone (it describes the LAST search, like `resourceQuery`).
- **Y10 - The row shows why.** `DiscussionReplyResources.tsx`: when
  `resourceState === "done"`, `resources` is empty and
  `resourceSearchOutcome` is set and the "Search terms cleared" line
  (`showClearedByEdit`) is NOT showing, render `outcome.text` as one
  `<p className={styles.fieldHint}>` LAST in the existing hint block, after
  the `showStaleQuery` line (cause, then effect) - never inside `.ghActions`.
  `showStaleQuery` requires `hasResources`, so it is mutually exclusive by
  construction (pin that in a test). The `<p>` gets a `useId` id and the
  "Search for resources" `Button` gets `aria-describedby={thatId}` while the
  note renders. No `!searching` guard (the `done` predicate already
  excludes it). No colour change, no icon, no emoji.
- **Y11 - The batch notice is specific.** The client keeps ONE notice per
  batch under exactly today's condition (`shouldPushDegradedNotice`,
  embedded-provider exclusion included - `degraded` already means every
  concept in the batch had no sources), but its text becomes `No web pages
  came back for this batch. Find resources retries every reply that came
  back empty.` A batch that is not degraded pushes no notice - the rows explain
  themselves (Y10) and the run summary counts them (Y12). The old generic
  sentence is retired.
- **Y12 - The log carries it.** `discussion-replies-log.ts`: the row gains
  `resourceSearchOutcome` (JSON: the `{ kind, text, counts }` object or
  `null`) and the CSV gains TWO columns appended LAST after `Resource search
  source`, in this order: `Links` (`resourceCount`) and `Resource search
  outcome` (the `text`, `?? ""`).
  The JSON row also gains `resourceCount` (no CSV column).
  `DiscussionRepliesLogSummary` gains `rowsWithNoResources` (rows with
  `resourceState === "done"` and `resourceCount === 0` - a row the
  instructor emptied by hand counts too) and
  `discussionRepliesLogSummaryLine` appends ` {n} replies got no links.`
  using its existing conditional-clause idiom (singular `reply` for 1;
  nothing when 0).
- **Y13 - One click retries every empty row.** `isFindMissingEligible`
  ALSO returns true for a row with `resourceState === "done"`, no
  resources, a non-empty reply, not skipped, and `resourceSearchOutcome`
  set. Its parameter type gains `resources?` and `resourceSearchOutcome?`
  as OPTIONAL fields (existing callers and the test's `makeRow` still
  type-check); its doc comment, which today says "done" is excluded
  whatever the outcome, is rewritten. A row the instructor emptied by hand has no outcome (Y9 clears it on
  a non-empty apply and nothing sets it afterwards) and stays excluded, so
  R11's "instructor emptied it" case is preserved. The toolbar's `Find
  resources (N)` count follows automatically because it reads the same
  predicate; its disabled title "No rows need resources" is unchanged.

## 4. What must NOT change

- The Learning Resources page's three-argument call sees byte-identical
  FIRST-attempt prompts and identical `links` for a fixture whose sources
  carry no `domain` and are not on the redirect host - proven by section
  5(e) in `learning-resource-links.test.ts` (the generator's own test mocks
  the action and proves nothing about prompts).
- The redirect host is never a link on the page (D2/B5) - a source that
  fails to resolve is still excluded by `verifyItemUrls`.
- `RESOURCE_BATCH_SIZE` (5), `MAX_CONCEPTS_PER_RUN` (6),
  `MAX_ITEMS_PER_CONCEPT` (4), the 3-per-post cap (R4f), the redaction order
  (BLOCKER 3), the eligible-kinds result-side filter, and every
  `resourceQuery`/`resourceQuerySource` rule from the RC doc.
- The drain's queue mechanics in `useReplyResources.ts` (R0-4/R5/R7/F5).
- The "use server" export rule (async functions only; types are fine).
- Line endings LF; no emojis anywhere; no file over 1000 lines (split
  before adding if a touched file would cross it).

## 5. Tests that must exist and must be able to fail

Group A:
- `grounding-sources.test.ts`: resolves a redirect-host source to its
  `Location` (absolute and relative); passes a non-redirect source through
  untouched with no fetch; keeps a source unchanged on timeout, non-3xx,
  missing Location, non-http Location, Location on the redirect host or
  news.google.com; the shared cache resolves a repeated URI with one fetch;
  the total budget (injected clock) leaves later sources unchanged; the pool
  never exceeds `maxConcurrent` in flight; `isGroundingRedirectHost` keeps
  its subdomain behaviour.
- `learning-resource-links.test.ts`: (a) a mocked grounded response whose
  sources are redirect URIs, plus a resolver fed by an injected fetch,
  yields a link whose url is the RESOLVED page and whose host was in no
  title; (b) items with `source: 0` take the resolved URL, `source: 99` and
  `source: "0"` keep their own; (c) a first attempt with items but NO
  sources triggers exactly one retry whose prompt starts with the Y3 line,
  and the first prompt is the frozen existing one (a literal oracle); the
  EXISTING "D2t/B2" degraded test gains a second sourceless mocked pair and
  asserts four calls with the degraded note unchanged; (d) `perConcept`
  arithmetic holds and sums equal the top-level counts; (e) a
  three-argument call with non-redirect, domain-less sources produces the
  same links and the same prompts as before; (f) `web.domain` alone
  corroborates a candidate on that host.
- `llm.test.ts`: `parseGroundingSources` copies `domain`, omits it when
  absent or empty.
- `llm.test.ts`: with `GEMINI_SEARCH_MODEL` set, a `webSearch` request's
  fetched URL names it and a non-webSearch request's does not (the
  existing `fetchMock.mock.calls[0]` URL idiom); unset -> both name
  `getGeminiModel()`. `gemini.test.ts`: `getGeminiSearchModel()`'s
  fallback only.

Group B:
- `discussion-replies-resources.test.ts`: each Y8 kind produces its exact
  sentence; a post with links has no `outcome`; duplicate concepts are sent
  once and both posts get the same outcome; a `failed` reason is clamped.
- serialization: `resourceSearchOutcome` round-trips; absent stays absent;
  a malformed value is dropped; the existing frozen oracle is unchanged.
- log: the CSV header ends with `Resource search outcome`; the JSON row
  carries the object; the summary line's ` N replies got no links.` clause
  for 0, 1, 2.
- `useReplyResources.test.ts`: `applyResources` receives the outcome for an
  empty result and `undefined` for a non-empty one; the Y11 text for a
  degraded batch and no notice for a non-degraded batch with empty rows;
  `isFindMissingEligible` for the four Y13 cases (done+empty+outcome ->
  true; done+empty+no outcome -> false; done+links -> false; skipped ->
  false).
- mutators: `applyResources` with an outcome stores it; a later non-empty
  apply clears it; `markResourceSearching` clears it.

## 6. Out of scope (recorded, not requested)

- Splitting a row's three concept terms into three separate concepts (the
  6-concept run cap would need a batch-size change).
- Using `groundingSupports` segment->chunk indices to corroborate an item
  by the prose paragraph that names it (deterministic, no round trip;
  worth doing if Y2's source index proves unreliable).
- Capturing `webSearchQueries` for the outcome text.
- Fetching page titles for resolved sources so an unmentioned source can
  become a candidate on its own.
- A model-forced tool call: the Gemini API has no `toolConfig` mode for the
  built-in Google Search tool, so Y3's nudge plus Y6's override is the
  available lever.
- A "no links" status filter chip (Y12's summary clause covers the
  run-level signal).
