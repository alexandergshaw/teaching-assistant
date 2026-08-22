// The first code path in this repo that actually fetches a candidate URL to
// see whether it resolves. Everything that existed before this module -
// `verifyItemUrls`, `isPlaceholderUrl`, `sanitizeResourceUrl`, `stripModelUrls`
// (see src/lib/urls.ts) - is string/hostname matching only; none of it makes a
// network call. This module exists because none of that proves a link is
// alive: src/lib/urls.ts:8-11 records the incident behind it - a generated
// course shipped 37 dead links out of 73 because a model asked to "give the
// URL" fabricates one at roughly that rate, and a real URL it types out is
// easy to mangle. The links this checker guards go onto a student-facing
// Canvas page (official docs, YouTube videos, tutorials), so the same
// standard applies here as to the rest of the pipeline: code decides, not the
// model's say-so.
//
// FAIL-CLOSED (D3 in docs/learning-resources-real-links-acceptance-criteria.md):
// a 4xx, a 5xx, a network error, a timeout, and an exhausted total budget are
// ALL treated identically - not alive. A "probably fine, we just couldn't
// check in time" link is worse than no link at all, because the instructor
// looking at the finished page has no way to tell a verified link from a
// guess; the only way to keep that promise true is to never let an
// unconfirmed outcome silently pass as alive.
//
// This module does not duplicate src/lib/urls.ts. It has no opinion on
// syntactic cleanup (sanitizeResourceUrl), placeholder detection
// (isPlaceholderUrl), or corroboration - callers run those gates first and
// only hand this module candidates that already cleared them. Its only job is
// "does this URL resolve right now," decided by actually asking.

/** Per-request timeout: how long a single HEAD or GET attempt is allowed to
 *  take before it is treated as a timeout (not alive). Deliberately short -
 *  this runs inside a Server Action against Vercel Hobby's 60s ceiling
 *  (D6), and a batch of candidate links must not let one slow server eat the
 *  whole budget. */
export const REACHABILITY_TIMEOUT_MS = 3000;

/** How many checks may be in flight at once. Bounds outbound connections
 *  regardless of how many candidate URLs a run produces. */
export const REACHABILITY_MAX_CONCURRENT = 6;

/** Total wall-clock budget for the whole batch, shared across every URL
 *  passed to one call. See the "budget" reason below for what happens to
 *  URLs that do not get checked before this runs out. */
export const REACHABILITY_TOTAL_BUDGET_MS = 12000;

export type ReachabilityReason =
  | "ok"
  | "client-error"
  | "server-error"
  | "network"
  | "timeout"
  | "budget";

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

export interface ReachabilityOptions {
  timeoutMs?: number;
  maxConcurrent?: number;
  totalBudgetMs?: number;
  /** Clock override so the total-budget cutoff can be driven deterministically
   *  in tests - no real waiting, no fake timers, just a controlled sequence
   *  of readings. Defaults to `Date.now`. */
  now?: () => number;
}

/** The real `fetch`, used when no `fetchImpl` is supplied (production). Kept
 *  as a plain wrapper - not referenced by name inside the checking logic
 *  below - so every code path that decides alive/not-alive is exercised
 *  identically whether the caller is production or a test. */
const defaultFetchImpl: ReachabilityFetch = (url, init) => fetch(url, init);

type FetchAttempt =
  | { kind: "response"; status: number }
  | { kind: "timeout" }
  | { kind: "network" };

/**
 * One HTTP attempt (HEAD or GET) against `url`, bounded by `timeoutMs`. Never
 * throws: a rejection from `fetchImpl` becomes `{ kind: "network" }` unless
 * OUR OWN timer fired first, in which case it is `{ kind: "timeout" }`
 * regardless of what `fetchImpl` actually threw (an AbortError, a generic
 * TypeError, whatever the injected implementation - or a real environment's
 * fetch - happens to reject with). Deciding "was this our timeout" from the
 * timer flag rather than from the error's shape is what makes the outcome
 * independent of the fetch implementation.
 */
async function attemptFetch(
  fetchImpl: ReachabilityFetch,
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number
): Promise<FetchAttempt> {
  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, { method, redirect: "follow", signal: controller.signal });
    return { kind: "response", status: response.status };
  } catch {
    return timedOut ? { kind: "timeout" } : { kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** Many servers reject HEAD outright (405 Method Not Allowed, or the rarer
 *  501 Not Implemented) even though the resource is perfectly reachable via
 *  GET. Retrying once with GET on exactly these two statuses recovers those
 *  sites without giving up the HEAD-first savings (no response body) for
 *  everything else. Any OTHER status from the HEAD attempt is final - only
 *  "the server does not support HEAD" earns a second attempt. */
function needsGetRetry(attempt: FetchAttempt): boolean {
  return attempt.kind === "response" && (attempt.status === 405 || attempt.status === 501);
}

/** 2xx/3xx is the only path to `alive: true` (D3). Everything else is
 *  bucketed by status range purely for the caller's diagnostics - the
 *  alive/not-alive verdict does not depend on which not-alive reason is
 *  reported. */
function classifyStatus(status: number): ReachabilityResult["reason"] {
  if (status >= 200 && status < 400) return "ok";
  if (status >= 500) return "server-error";
  return "client-error";
}

/**
 * Check one URL: HEAD first, GET retry only when the HEAD attempt itself
 * completed and reported 405/501 (see needsGetRetry). `remainingBudget` is
 * read again before EACH attempt (not just once per URL) so a HEAD that
 * consumes most of the shared budget cannot smuggle a GET retry in past the
 * deadline - the retry gets exactly what is left, same as a fresh URL would.
 */
async function checkOneUrl(
  url: string,
  fetchImpl: ReachabilityFetch,
  timeoutMs: number,
  remainingBudget: () => number
): Promise<ReachabilityResult> {
  try {
    const budgetBeforeHead = remainingBudget();
    if (budgetBeforeHead <= 0) return { url, alive: false, reason: "budget" };

    let attempt = await attemptFetch(fetchImpl, url, "HEAD", Math.min(timeoutMs, budgetBeforeHead));

    if (needsGetRetry(attempt)) {
      const budgetBeforeGet = remainingBudget();
      if (budgetBeforeGet <= 0) return { url, alive: false, reason: "budget" };
      attempt = await attemptFetch(fetchImpl, url, "GET", Math.min(timeoutMs, budgetBeforeGet));
    }

    if (attempt.kind === "timeout") return { url, alive: false, reason: "timeout" };
    if (attempt.kind === "network") return { url, alive: false, reason: "network" };

    const reason = classifyStatus(attempt.status);
    return { url, alive: reason === "ok", status: attempt.status, reason };
  } catch {
    // Defensive only - attemptFetch already catches everything it can throw.
    // Kept because this function's one hard contract (NEVER throws) must
    // hold even if a future edit adds code between the calls above that can.
    return { url, alive: false, reason: "network" };
  }
}

/**
 * Check whether each of `urls` resolves. HEAD first; retried once with GET
 * only when the server rejects HEAD (405/501). 2xx/3xx counts as alive;
 * 4xx/5xx, a network error, a timeout, and running out of the shared total
 * budget all count as not alive (D3 - fail closed, see the module header).
 *
 * Bounded three ways at once, because this runs inside a Server Action
 * against Vercel Hobby's 60s ceiling (D6):
 *   - `timeoutMs` bounds any ONE HTTP attempt (a HEAD and a GET retry are two
 *     separate attempts, each gets its own window, capped by whatever of the
 *     total budget remains - see checkOneUrl).
 *   - `maxConcurrent` bounds how many attempts are in flight at once - a
 *     fixed-size worker pool below, not one promise per URL.
 *   - `totalBudgetMs` bounds the WHOLE batch. It is checked again before
 *     every single attempt (not deducted once up front), so a URL that has
 *     not started by the time the budget is gone - because earlier ones were
 *     slow, or because there were simply more URLs than time - comes back
 *     `{ alive: false, reason: "budget" }` rather than being silently
 *     dropped from the results. The result array is always the same length
 *     and order as the input; nothing is ever omitted.
 *
 * NEVER throws. A `fetchImpl` that rejects, or throws synchronously, only
 * ever affects the one result for that URL.
 */
export async function checkUrlsReachable(
  urls: readonly string[],
  fetchImpl: ReachabilityFetch = defaultFetchImpl,
  options?: ReachabilityOptions
): Promise<ReachabilityResult[]> {
  const timeoutMs = options?.timeoutMs ?? REACHABILITY_TIMEOUT_MS;
  const maxConcurrent = options?.maxConcurrent ?? REACHABILITY_MAX_CONCURRENT;
  const totalBudgetMs = options?.totalBudgetMs ?? REACHABILITY_TOTAL_BUDGET_MS;
  const now = options?.now ?? Date.now;

  const results: ReachabilityResult[] = new Array(urls.length);
  if (urls.length === 0) return results;

  const startedAt = now();
  const remainingBudget = () => totalBudgetMs - (now() - startedAt);

  // A fixed-size worker pool, not one promise per URL: each worker pulls the
  // next unclaimed index and processes it before pulling another, so at most
  // `workerCount` fetch attempts are ever in flight regardless of how many
  // URLs were passed in.
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= urls.length) return;
      results[index] = await checkOneUrl(urls[index], fetchImpl, timeoutMs, remainingBudget);
    }
  }

  const workerCount = Math.max(1, Math.min(maxConcurrent, urls.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
