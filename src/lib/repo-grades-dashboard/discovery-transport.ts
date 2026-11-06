import "server-only";

import { createHash } from "node:crypto";
import { githubRestHeaders } from "@/lib/github.repos";

const API_ORIGIN = "https://api.github.com";
const MAX_REQUESTS = 300;
const DEADLINE_MS = 40_000;
const MAX_SUCCESS_BYTES = 8 * 1024 * 1024;
const MAX_ERROR_BYTES = 16 * 1024;
const MAX_AGGREGATE_BYTES = 32 * 1024 * 1024;
const MAX_RETRY_TIMESTAMP_MS = Date.UTC(9999, 11, 31);

type ThrottleStop = "rate-limited" | "throttle-unconfirmed";
export type DiscoveryRateLimit = { retryAtMs: number | null; primary: boolean };
type AbortStop = ThrottleStop | "deadline-exceeded" | "body-budget-exhausted";
export type DiscoveryTransportFailure = AbortStop | "request-budget-exhausted" | "redirect-rejected"
  | "response-too-large" | "access-denied" | "unavailable";

export class DiscoveryTransportError extends Error {
  constructor(readonly reason: DiscoveryTransportFailure) {
    super(reason);
  }
}

function fail(reason: DiscoveryTransportFailure): never {
  throw new DiscoveryTransportError(reason);
}

function cancelWithoutWaiting(body: { cancel(): Promise<void> } | null) {
  try {
    void body?.cancel().catch(() => undefined);
  } catch {
    // Cleanup must not change the request's outcome or extend its deadline.
  }
}

async function untilAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  const interrupted = Promise.withResolvers<never>();
  const abort = () => interrupted.reject(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  try {
    return await Promise.race([interrupted.promise, pending]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
}

function errorMessage(value: unknown): string {
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string"
    && value.message.trim()) return value.message;
  return fail("throttle-unconfirmed");
}

function headerMilliseconds(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  return value && /^\d+$/.test(value) ? Math.min(Number(value) * 1_000, MAX_RETRY_TIMESTAMP_MS) : null;
}

function isQuotaEmpty(headers: Headers) {
  return /^-?0+$/.test(headers.get("x-ratelimit-remaining")?.trim() ?? "");
}

export function createDiscoveryTransport() {
  const deadlineAt = performance.now() + DEADLINE_MS;
  const timeout = AbortSignal.timeout(DEADLINE_MS);
  const controller = new AbortController();
  const signal = controller.signal;
  const fences = new Set<symbol>();
  let fenceChanged = Promise.withResolvers<void>();
  let requests = 0;
  let bytes = 0;
  let throttled: ThrottleStop | undefined;
  let rateLimit: DiscoveryRateLimit | undefined;
  let stopped: AbortStop | undefined;
  let headers: ReturnType<typeof githubRestHeaders> | undefined;
  let credentialScope: string | undefined;

  function notifyFenceChanged() {
    fenceChanged.resolve();
    fenceChanged = Promise.withResolvers<void>();
  }

  function latchThrottle(reason: ThrottleStop, response?: Response) {
    if (reason === "rate-limited" && response) {
      const now = Date.now();
      const reset = isQuotaEmpty(response.headers) ? headerMilliseconds(response.headers, "x-ratelimit-reset") : null;
      const primary = reset !== null && reset > now;
      const retryAfter = headerMilliseconds(response.headers, "retry-after");
      const retryAt = retryAfter === null ? 0 : Math.min(now + retryAfter, MAX_RETRY_TIMESTAMP_MS);
      const retryAtMs = Math.max(primary ? reset : 0, retryAt, rateLimit?.retryAtMs ?? 0) || null;
      rateLimit = { retryAtMs, primary: primary || rateLimit?.primary === true };
    }
    if (throttled === "rate-limited" || throttled === reason) return;
    throttled = reason;
    notifyFenceChanged();
  }

  function abortAll(reason: AbortStop) {
    stopped ??= reason;
    controller.abort();
  }

  function expire() {
    if (fences.size && !throttled) latchThrottle("throttle-unconfirmed");
    abortAll(throttled ?? "deadline-exceeded");
  }

  function checkActive() {
    if (!stopped && (timeout.aborted || performance.now() >= deadlineAt)) expire();
    if (stopped) fail(stopped);
  }

  timeout.addEventListener("abort", expire, { once: true });

  async function readBody(response: Response, limit: number): Promise<Uint8Array> {
    const reader = response.body?.getReader();
    let buffer = new Uint8Array(0);
    if (!reader) return buffer;
    let used = 0;
    let finished = false;
    try {
      while (true) {
        checkActive();
        const { done, value } = await untilAbort(reader.read(), signal);
        if (done) {
          finished = true;
          return buffer.subarray(0, used);
        }
        // Charge delivered chunks before either per-response rejection or retention.
        bytes += value.byteLength;
        if (bytes > MAX_AGGREGATE_BYTES) abortAll("body-budget-exhausted");
        checkActive();
        const needed = used + value.byteLength;
        if (needed > limit) fail("response-too-large");
        if (needed > buffer.length) {
          const expanded = new Uint8Array(Math.min(limit, Math.max(needed, buffer.length * 2)));
          expanded.set(buffer);
          buffer = expanded;
        }
        buffer.set(value, used);
        used = needed;
      }
    } finally {
      if (!finished) cancelWithoutWaiting(reader);
      reader.releaseLock();
    }
  }

  async function classifyForbidden(response: Response): Promise<never> {
    const fence = Symbol();
    fences.add(fence);
    try {
      let message: string;
      try {
        const body = await readBody(response, MAX_ERROR_BYTES);
        checkActive();
        message = errorMessage(parseJson(body));
        checkActive();
      } catch {
        // The response could have been a throttle even when its body is unavailable.
        checkActive();
        latchThrottle("throttle-unconfirmed");
        return fail(throttled ?? "throttle-unconfirmed");
      }
      const limited = /\brate[\s-]+limit\b|\babuse detection\b/i.test(message);
      checkActive();
      if (limited) {
        latchThrottle("rate-limited", response);
        return fail("rate-limited");
      }
      return fail("access-denied");
    } finally {
      fences.delete(fence);
      notifyFenceChanged();
    }
  }

  async function getJson<T>(path: `/${string}`, validate: (value: unknown) => T): Promise<T> {
    try {
      while (fences.size && !throttled) {
        checkActive();
        await untilAbort(fenceChanged.promise, signal);
      }
      if (throttled) fail(throttled);
      checkActive();
      if (requests >= MAX_REQUESTS) fail("request-budget-exhausted");
      const url = new URL(path, API_ORIGIN);
      if (url.origin !== API_ORIGIN || url.username || url.password) fail("unavailable");
      headers ??= githubRestHeaders();
      // No await between admission, charging, and starting the network request.
      requests += 1;
      const pending = fetch(url.href, {
        method: "GET", redirect: "manual", cache: "no-store", headers, signal,
      }).then((response) => {
        if (signal.aborted) cancelWithoutWaiting(response.body);
        return response;
      });
      const response = await untilAbort(pending, signal);
      try {
        checkActive();
      } catch (error) {
        cancelWithoutWaiting(response.body);
        throw error;
      }

      const { status } = response;
      const limited = status === 429 || isQuotaEmpty(response.headers)
        || (status === 403 && response.headers.has("retry-after"));
      if (limited) latchThrottle("rate-limited", response);
      if ((status >= 300 && status < 400) || response.type === "opaqueredirect" || response.redirected) {
        cancelWithoutWaiting(response.body);
        return fail("redirect-rejected");
      }
      if (limited && !response.ok) {
        cancelWithoutWaiting(response.body);
        return fail("rate-limited");
      }
      if (status === 403) return await classifyForbidden(response);
      const body = await readBody(response, response.ok ? MAX_SUCCESS_BYTES : MAX_ERROR_BYTES);
      checkActive();
      if (!response.ok) return fail(status === 401 ? "access-denied" : "unavailable");
      const value = parseJson(body);
      checkActive();
      const result = validate(value);
      checkActive();
      return result;
    } catch (error) {
      checkActive();
      if (error instanceof DiscoveryTransportError) throw error;
      return fail("unavailable");
    }
  }

  function treeCacheScope() {
    checkActive();
    if (throttled || fences.size) return undefined;
    // The transport uses the same headers for the live ref and pinned tree.
    headers ??= githubRestHeaders();
    credentialScope ??= createHash("sha256").update(headers.Authorization).digest("hex");
    return credentialScope;
  }

  return { getJson, checkActive, treeCacheScope, rateLimit: () => rateLimit, dispose: () => timeout.removeEventListener("abort", expire) };
}
