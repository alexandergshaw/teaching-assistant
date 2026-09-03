// Resolves Gemini's Search-grounding redirect links
// (vertexaisearch.cloud.google.com/grounding-api-redirect/...) to the real
// publisher page behind them.
//
// WHY THIS EXISTS: `groundingChunks[].web.uri` is ALWAYS a link through
// Google's redirector, never the publisher's own URL - the pipeline
// (correctly) refuses to treat that host as a citation, so every grounding
// source ever stayed opaque past this point (current-events-report.ts's own
// verifyItemUrls comment documents the same fact for its title-domain
// workaround). This module answers the redirect directly: a plain GET with
// `redirect: "manual"` reads the 3xx `Location` header without ever
// following it, which is the real page. Once resolved, that page becomes
// BOTH a corroborating host (verifyItemUrls seeing a resolved uri instead of
// an opaque one) and a citable candidate url in its own right (the
// "SOURCES VISITED BY THE SEARCH" list built in resource-item-parsing.ts).
//
// VENDOR ASSUMPTION, UNVERIFIED LOCALLY (there is no local Gemini key to
// probe with): the redirector answers a plain GET with a 3xx and a
// `Location` header. If it instead answers 200/403/429, every source stays
// unchanged (see `ALLOWED_REDIRECT_STATUSES` below) and the whole pipeline
// behaves exactly as if this module were a no-op, plus `web.domain`
// corroboration (verifyItemUrls) - no regression, just no new resolution.
//
// This module imports nothing from current-events-report.ts (leaf-ward
// only, no cycle) and nothing from src/app/, so it stays reachable from
// anywhere Source (src/lib/llm.ts) is.
import type { Source } from "@/lib/llm";

/** Google's Search grounding redirector. See the module header for why every
 *  grounding source's `uri` arrives on this host. */
export const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/** Lowercase a hostname, strip one leading "www.", and drop a trailing dot -
 *  the one definition of host normalization every caller in this pipeline
 *  shares (this module's own resolver and isRealHostSource below, and
 *  current-events-report.ts's verifyItemUrls). */
export function normalizeHost(host: string): string {
  let h = host.toLowerCase().trim();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

/** True when `host` (already normalized - see normalizeHost above; every
 *  caller passes a normalized host) is the grounding redirector itself or a
 *  subdomain of it. */
export function isGroundingRedirectHost(host: string): boolean {
  return host === GROUNDING_REDIRECT_HOST || host.endsWith("." + GROUNDING_REDIRECT_HOST);
}

/** True when `source.uri`'s host is NOT the grounding redirect host - i.e.
 *  this source is a real, direct page (either because it always was, or
 *  because a resolver's `resolve()` just turned it into one). An unparseable
 *  uri counts as not-a-real-host (never listed as visited, never counted as
 *  resolved). */
export function isRealHostSource(source: Source): boolean {
  try {
    return !isGroundingRedirectHost(normalizeHost(new URL(source.uri).hostname));
  } catch {
    return false;
  }
}

/** True when `host` (already normalized) is exactly `base` or a subdomain of
 *  it - the same "exact or subdomain" rule isGroundingRedirectHost uses,
 *  applied to the resolved Location's host so a redirect chain that lands on
 *  news.google.com (an aggregator link, not a publisher page - see Y1's own
 *  exclusion list) is treated the same way a second hop back onto the
 *  redirector itself would be. */
function isHostOrSubdomain(host: string, base: string): boolean {
  return host === base || host.endsWith("." + base);
}

const NEWS_GOOGLE_HOST = "news.google.com";

/** 3xx statuses this resolver treats as "the redirector answered with a real
 *  redirect" - anything else (including a 200, which the vendor-assumption
 *  note above flags as a real possibility) leaves the source unchanged. */
const ALLOWED_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** After this many CONSECUTIVE fetches that come back non-3xx or fail
 *  outright (thrown, timed out), a resolver instance stops issuing new
 *  fetches for the rest of its life and passes every remaining source
 *  through unchanged - see the circuit-breaker note on createGroundingResolver
 *  below for why the worker pool and total budget alone are not enough to
 *  bound this. */
const CONSECUTIVE_FAILURE_LIMIT = 4;

/** Per-request timeout for one resolution fetch, capped further by whatever
 *  of the shared total budget remains (see remainingBudget below) - mirrors
 *  url-reachability.ts's own REACHABILITY_TIMEOUT_MS reasoning. */
export const GROUNDING_RESOLVE_TIMEOUT_MS = 3000;

/** How many resolution fetches may be in flight at once, TOTAL across every
 *  concept's call to the SAME resolver instance's `resolve()` - not a fresh
 *  allowance per call. See createGroundingResolver's own comment for why a
 *  per-call worker pool would not be enough here. */
export const GROUNDING_RESOLVE_MAX_CONCURRENT = 6;

/** Total wall-clock budget for the WHOLE run (every concept, every retry),
 *  started once when the resolver is created - not reset per concept or per
 *  attempt (Y7). Deliberately small relative to
 *  REACHABILITY_TOTAL_BUDGET_MS (12s): this is a nice-to-have that resolves
 *  opaque links into corroborating hosts, not the reachability check itself,
 *  and it runs BEFORE the structuring call on the critical path of every
 *  concept's research pair. */
export const GROUNDING_RESOLVE_TOTAL_BUDGET_MS = 5000;

/** Minimal structural subset of `fetch` this module needs, injected so tests
 *  never touch the network - precedented by url-reachability.ts's own
 *  ReachabilityFetch. Deliberately a DIFFERENT type, not a re-export of it:
 *  ReachabilityFetch hard-codes `redirect: "follow"` (it wants the final
 *  page), while this resolver's entire job depends on `redirect: "manual"`
 *  (it wants the Location header, never the page the redirect points to) -
 *  the manual-redirect + `headers.get("location")` reading precedent is
 *  ghRedirectLocation in src/lib/github.actions.ts. */
export type GroundingFetch = (
  url: string,
  init: {
    method: "GET";
    redirect: "manual";
    headers: Record<string, string>;
    signal: AbortSignal;
  }
) => Promise<{ status: number; headers: { get(name: string): string | null } }>;

/** The real `fetch`, used when no `fetchImpl` is supplied (production) - kept
 *  as a plain wrapper, not referenced by name inside the resolution logic
 *  below, so production and test code paths are identical apart from which
 *  function is injected. */
const defaultFetchImpl: GroundingFetch = (url, init) => fetch(url, init);

const GROUNDING_RESOLVE_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (compatible; TeachingAssistantResourceBot/1.0)",
  Accept: "text/html,application/xhtml+xml",
};

export interface GroundingResolverOptions {
  fetchImpl?: GroundingFetch;
  /** Clock override so the total-budget cutoff is deterministic in tests -
   *  no real waiting. Defaults to Date.now, precedented by
   *  url-reachability.ts's own `now` option. */
  now?: () => number;
  maxConcurrent?: number;
  totalBudgetMs?: number;
  timeoutMs?: number;
}

export interface GroundingResolver {
  /** Resolve every redirect-host source in `sources` to its real page.
   *  Returns an array the same length and order as `sources` - a source that
   *  is not on the redirect host, or that fails to resolve for any reason
   *  (see the module header's five UNCHANGED cases), comes back UNCHANGED,
   *  never dropped. */
  resolve(sources: readonly Source[]): Promise<Source[]>;
}

/**
 * A small concurrency limiter (the classic "p-limit" shape): at most
 * `maxConcurrent` tasks passed to the returned function run at once, queued
 * FIFO beyond that. This is what makes maxConcurrent a bound TOTAL across
 * every call to the resolver's `resolve()`, not a fresh allowance handed out
 * per call - `findResourceLinksForConceptsAction` fans its concepts out
 * concurrently (Promise.allSettled), so several `resolve()` calls can be in
 * flight on the SAME resolver instance at once; a worker pool re-created
 * inside each `resolve()` call (checkUrlsReachable's own shape, which only
 * ever serves ONE caller per call) would let maxConcurrent be exceeded in
 * total across concepts. One limiter, created once per resolver and shared
 * by every task any `resolve()` call schedules, is what keeps the bound
 * real - functionally the same guarantee as checkUrlsReachable's worker
 * pool (never more than `maxConcurrent` attempts in flight), adapted to a
 * resolver that outlives any single batch.
 */
function createLimiter(maxConcurrent: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  function runNext(): void {
    if (active >= maxConcurrent) return;
    const next = queue.shift();
    if (!next) return;
    active++;
    next();
  }

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task().then(
          (value) => {
            active--;
            resolve(value);
            runNext();
          },
          (err) => {
            active--;
            reject(err);
            runNext();
          }
        );
      });
      runNext();
    });
  };
}

/**
 * Create ONE resolver for a whole run, shared by every concept (Y1/Y7): one
 * worker pool (`maxConcurrent`, default 6, TOTAL across concepts - see
 * createLimiter above), one wall-clock budget (`totalBudgetMs`, default
 * 5000ms, started HERE, when the resolver is created - not per concept, not
 * per attempt), and one `Map<uri, Source>`-shaped cache so a uri resolved for
 * one concept is free for the next (and a uri requested twice at once, by two
 * concurrent concepts, triggers exactly one fetch - both callers share the
 * same in-flight promise).
 *
 * For each source whose host is the grounding redirect host: a GET with
 * `redirect: "manual"`, the explicit headers above, accepting ONLY a
 * 301/302/303/307/308 status with a `Location` header, resolving a relative
 * Location against the request url, and returning `{ ...source, uri:
 * <resolved> }`. A source stays UNCHANGED (never dropped) when: it is not on
 * the redirect host (zero fetches for these - see resolveOne below); the
 * fetch throws, times out, or the shared budget is already spent; the status
 * is not one of the five above; the Location is missing, not http(s), or its
 * host is the redirect host itself or news.google.com (an aggregator link,
 * not a publisher page); or the circuit breaker has already tripped (see
 * below).
 *
 * CIRCUIT BREAKER: a source list can be large, and the worker pool bounds
 * only how many fetches are IN FLIGHT at once, not how many are ATTEMPTED - a
 * redirector answering every request with a fast 429 would otherwise let the
 * pool grind through the whole list in a handful of seconds, one request
 * after another. After CONSECUTIVE_FAILURE_LIMIT (4) fetches in a row come
 * back non-3xx or fail outright (network error, timeout), this resolver
 * instance stops fetching entirely - every source still to be resolved,
 * across every remaining call to `resolve()`, comes back unchanged with zero
 * further network attempts. A single successful (3xx) response resets the
 * counter, so an intermittently-failing redirector does not trip the breaker
 * on unrelated, non-consecutive failures.
 */
export function createGroundingResolver(options?: GroundingResolverOptions): GroundingResolver {
  const fetchImpl = options?.fetchImpl ?? defaultFetchImpl;
  const now = options?.now ?? Date.now;
  const maxConcurrent = options?.maxConcurrent ?? GROUNDING_RESOLVE_MAX_CONCURRENT;
  const totalBudgetMs = options?.totalBudgetMs ?? GROUNDING_RESOLVE_TOTAL_BUDGET_MS;
  const timeoutMs = options?.timeoutMs ?? GROUNDING_RESOLVE_TIMEOUT_MS;

  const startedAt = now();
  const remainingBudget = () => totalBudgetMs - (now() - startedAt);
  const limit = createLimiter(maxConcurrent);

  // Keyed by the ORIGINAL (redirect) uri, valued by a promise of the
  // resolved uri (or undefined - stays unchanged). Storing the promise, not
  // just the eventual result, is what dedupes two concurrent requests for
  // the same uri into one fetch: the second caller finds the promise already
  // in the map and awaits it instead of scheduling a second task.
  const cache = new Map<string, Promise<string | undefined>>();

  // Circuit breaker state, shared by every fetch this resolver instance ever
  // issues (see createGroundingResolver's own doc comment above).
  let consecutiveFailures = 0;
  let circuitOpen = false;

  async function fetchResolution(uri: string): Promise<string | undefined> {
    if (circuitOpen) return undefined;

    const budget = remainingBudget();
    if (budget <= 0) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(0, Math.min(timeoutMs, budget)));
    // Did THIS fetch complete with a status this resolver treats as "the
    // redirector answered" (a 3xx, even one whose Location we go on to
    // reject for policy reasons below)? Only a non-3xx status or a thrown
    // error/timeout counts against the circuit breaker - a 3xx to an
    // excluded host (the redirect host itself, news.google.com) is a
    // working fetch, not a failure.
    let fetchSucceeded = false;
    try {
      const response = await fetchImpl(uri, {
        method: "GET",
        redirect: "manual",
        headers: GROUNDING_RESOLVE_HEADERS,
        signal: controller.signal,
      });

      if (!ALLOWED_REDIRECT_STATUSES.has(response.status)) return undefined;
      fetchSucceeded = true;

      const location = response.headers.get("location");
      if (!location) return undefined;

      let resolvedUrl: URL;
      try {
        resolvedUrl = new URL(location, uri);
      } catch {
        return undefined;
      }
      if (resolvedUrl.protocol !== "http:" && resolvedUrl.protocol !== "https:") return undefined;

      const resolvedHost = normalizeHost(resolvedUrl.hostname);
      if (isGroundingRedirectHost(resolvedHost)) return undefined;
      if (isHostOrSubdomain(resolvedHost, NEWS_GOOGLE_HOST)) return undefined;

      return resolvedUrl.toString();
    } catch {
      // Network error, or our own timer firing via controller.abort() -
      // either way, unchanged (fail-open to "leave it alone", never throw).
      return undefined;
    } finally {
      // The injected fetch type exposes only status/headers, so nothing in
      // this module ever reads or drains a response body - left alone, an
      // unread body keeps its underlying connection open until garbage
      // collection (or a runtime-specific body timeout) reclaims it.
      // Aborting the controller here, on EVERY path (success, rejection, or
      // an early return above), tells the fetch implementation to destroy
      // that body/connection deterministically instead of leaking it for
      // however long the runtime takes to notice nobody is reading it.
      controller.abort();
      clearTimeout(timer);
      if (fetchSucceeded) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures += 1;
        if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) circuitOpen = true;
      }
    }
  }

  async function resolveOne(source: Source): Promise<Source> {
    let host: string;
    try {
      host = normalizeHost(new URL(source.uri).hostname);
    } catch {
      return source;
    }
    // Not on the redirect host: zero fetches, no cache entry, no limiter
    // slot consumed - this is the common case for a real, direct source
    // uri, and Y2/Section 4 depend on it costing nothing.
    if (!isGroundingRedirectHost(host)) return source;

    let pending = cache.get(source.uri);
    if (!pending) {
      pending = limit(() => fetchResolution(source.uri));
      cache.set(source.uri, pending);
    }
    const resolvedUri = await pending;
    return resolvedUri ? { ...source, uri: resolvedUri } : source;
  }

  return {
    async resolve(sources: readonly Source[]): Promise<Source[]> {
      return Promise.all(sources.map((source) => resolveOne(source)));
    },
  };
}
