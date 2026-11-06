import "server-only";

import { createHash } from "node:crypto";
import { createGithubBoundedReadContext, readBoundedResponse } from "./github-bounded-read";
import { githubRestHeaders } from "./github.repos";

const REFRESH_INTERVAL_MS = 60_000;
const RESPONSE_LIMIT = 16 * 1024;
const MAX_CACHED_ACCOUNTS = 64;

export type GithubQuotaResult =
  | { status: "not-configured" | "unavailable" | "throttled" }
  | {
    status: "observed";
    limit: number | null;
    remaining: number | null;
    resetAtMs: number | null;
    observedAtMs: number;
    staleAtMs: number;
  };

type CacheEntry = { result: Promise<GithubQuotaResult>; refreshAfterMs: number };
const quotaChecks = new Map<string, CacheEntry>();

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function timestamp(seconds: unknown): number | null {
  const value = count(seconds);
  return value !== null && value > 0 && value <= 8_640_000_000_000 ? value * 1_000 : null;
}

function headerSeconds(raw: string | null): number | null {
  return raw && /^\d+$/.test(raw) ? count(Number(raw)) : null;
}

function observe(core: unknown): GithubQuotaResult {
  if (!core || typeof core !== "object") return { status: "unavailable" };
  const limit = count("limit" in core ? core.limit : null);
  const reportedRemaining = count("remaining" in core ? core.remaining : null);
  const remaining = limit !== null && reportedRemaining !== null && reportedRemaining > limit ? null : reportedRemaining;
  const resetAtMs = timestamp("reset" in core ? core.reset : null);
  if (limit === null && remaining === null && resetAtMs === null) return { status: "unavailable" };
  const observedAtMs = Date.now();
  return { status: "observed", limit, remaining, resetAtMs, observedAtMs, staleAtMs: observedAtMs + REFRESH_INTERVAL_MS };
}

async function requestQuota(headers: ReturnType<typeof githubRestHeaders>): Promise<{
  result: GithubQuotaResult;
  retryAfterMs?: number;
}> {
  const context = createGithubBoundedReadContext(Date.now() + 5_000, RESPONSE_LIMIT);
  try {
    const response = await fetch("https://api.github.com/rate_limit", {
      headers, signal: context.controller.signal, redirect: "error", cache: "no-store",
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      const remaining = headerSeconds(response.headers.get("x-ratelimit-remaining"));
      const retryAfter = headerSeconds(response.headers.get("retry-after"));
      const throttled = response.status === 429 || (response.status === 403 && (retryAfter !== null || remaining === 0));
      if (!throttled) return { result: { status: "unavailable" } };
      const reset = headerSeconds(response.headers.get("x-ratelimit-reset"));
      const retryAfterMs = retryAfter !== null ? Date.now() + retryAfter * 1_000 : undefined;
      if (remaining === 0 && response.headers.get("x-ratelimit-resource") === "core") {
        return { retryAfterMs, result: observe({ remaining, reset, limit: headerSeconds(response.headers.get("x-ratelimit-limit")) }) };
      }
      return { retryAfterMs, result: { status: "throttled" } };
    }
    const body = JSON.parse(await readBoundedResponse(response, context, RESPONSE_LIMIT));
    return { result: observe(body?.resources?.core) };
  } catch {
    return { result: { status: "unavailable" } };
  } finally {
    context.dispose();
  }
}

/** Call only after verifying the app owner's identity and matching the viewing account. */
export function readGithubQuota(accountId: string): Promise<GithubQuotaResult> {
  let headers: ReturnType<typeof githubRestHeaders>;
  try {
    headers = githubRestHeaders();
  } catch {
    return Promise.resolve({ status: "not-configured" });
  }
  const credential = createHash("sha256").update(headers.Authorization).digest("hex");
  const key = JSON.stringify([accountId, credential]);
  const cached = quotaChecks.get(key);
  if (cached && cached.refreshAfterMs > Date.now()) return cached.result;

  const result = requestQuota(headers).then(({ result, retryAfterMs }) => {
    // Keep pending requests coalesced. Apply upstream backoff, if any, once the check settles.
    const now = Date.now();
    const reset = result.status === "observed" ? result.resetAtMs : null;
    const nextCheck = reset !== null && reset > now ? reset : now + REFRESH_INTERVAL_MS;
    const refreshAfter = result.status === "observed" && result.remaining === 0
      ? nextCheck : Math.min(now + REFRESH_INTERVAL_MS, nextCheck);
    entry.refreshAfterMs = Math.max(refreshAfter, retryAfterMs ?? 0);
    return result;
  });
  const entry: CacheEntry = { result, refreshAfterMs: Infinity };
  quotaChecks.delete(key);
  quotaChecks.set(key, entry);
  if (quotaChecks.size > MAX_CACHED_ACCOUNTS) {
    const oldest = quotaChecks.keys().next().value;
    if (oldest !== undefined) quotaChecks.delete(oldest);
  }
  return result;
}
