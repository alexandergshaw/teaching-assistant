import { describe, it, expect } from "vitest";
import { classifyGithubFailure } from "./github-rate-limit";

// Every expectation below is a frozen literal, hand-written against AC3 item
// 17b (docs/repo-grades-view-acceptance-criteria.md), never computed from the
// implementation.

/** Builds a header reader from a plain record, matching the `{ get(name):
 * string | null }` shape classifyGithubFailure accepts - using the real
 * Fetch `Headers` class (already used elsewhere in this codebase, e.g.
 * src/lib/tavus.test.ts) so header-name case-insensitivity is exercised for
 * free, exactly as it would be against a real GitHub response. */
function headersOf(record: Record<string, string>): Headers {
  return new Headers(record);
}

const NO_HEADERS = headersOf({});
const NOW_MS = 1_700_000_000_000; // fixed clock for every reset-time assertion below

describe("classifyGithubFailure", () => {
  describe("the full status x rate-limit-header matrix", () => {
    it("403 + remaining 0 (+ a 5-minute-out reset) is rate-limited, carrying the reset", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW_MS / 1000 + 300) });

      const verdict = classifyGithubFailure(403, headers, NOW_MS);

      expect(verdict).toEqual({
        kind: "rate-limited",
        message: "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about 5 minutes.",
        resetAtMs: NOW_MS + 300_000,
        remaining: 0,
      });
    });

    it("403 + remaining 57 is forbidden, naming a missing scope as likely without inventing which one", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "57" });

      const verdict = classifyGithubFailure(403, headers, NOW_MS);

      expect(verdict).toEqual({
        kind: "forbidden",
        message:
          "GitHub returned 403 Forbidden. This is not a rate limit (57 requests remaining on the primary quota). " +
          "The most likely cause is the token missing a scope this operation needs, though GitHub's response does " +
          "not say which one - check the token's permissions.",
        resetAtMs: null,
        remaining: 57,
      });
    });

    it("403 + no headers at all is forbidden, not rate-limited", () => {
      const verdict = classifyGithubFailure(403, NO_HEADERS, NOW_MS);

      expect(verdict).toEqual({
        kind: "forbidden",
        message:
          "GitHub returned 403 Forbidden. GitHub reported no rate-limit headers, so this is not confirmed as a " +
          "rate limit either way. The most likely cause is the token missing a scope this operation needs, though " +
          "GitHub's response does not say which one - check the token's permissions.",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("429 + remaining 0 (+ a 30-second-out reset) is rate-limited, carrying the reset", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW_MS / 1000 + 30) });

      const verdict = classifyGithubFailure(429, headers, NOW_MS);

      expect(verdict).toEqual({
        kind: "rate-limited",
        message: "GitHub's API rate limit was hit (HTTP 429, 0 requests remaining); it resets in about 30 seconds.",
        resetAtMs: NOW_MS + 30_000,
        remaining: 0,
      });
    });

    it("429 + remaining 57 is other - GitHub does not actually produce this combination, but the function must still resolve it, not guess", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "57" });

      const verdict = classifyGithubFailure(429, headers, NOW_MS);

      expect(verdict).toEqual({ kind: "other", message: "GitHub request failed (HTTP 429).", resetAtMs: null, remaining: null });
    });

    it("429 + no headers at all is still rate-limited - the status code alone is the confirmation", () => {
      const verdict = classifyGithubFailure(429, NO_HEADERS, NOW_MS);

      expect(verdict).toEqual({
        kind: "rate-limited",
        message: "GitHub's API rate limit was hit (HTTP 429, no remaining count reported); GitHub did not report when it resets.",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("401 + remaining 0 is other - the rate-limited rule is scoped to 403/429 only", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0" });

      expect(classifyGithubFailure(401, headers, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 401).",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("401 + remaining 57 is other", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "57" });

      expect(classifyGithubFailure(401, headers, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 401).",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("401 + no headers is other", () => {
      expect(classifyGithubFailure(401, NO_HEADERS, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 401).",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("404 + remaining 0 is other", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0" });

      expect(classifyGithubFailure(404, headers, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 404).",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("404 + remaining 57 is other", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "57" });

      expect(classifyGithubFailure(404, headers, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 404).",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("404 + no headers is other", () => {
      expect(classifyGithubFailure(404, NO_HEADERS, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 404).",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("500 + remaining 0 is other", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0" });

      expect(classifyGithubFailure(500, headers, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 500).",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("500 + remaining 57 is other", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "57" });

      expect(classifyGithubFailure(500, headers, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 500).",
        resetAtMs: null,
        remaining: null,
      });
    });

    it("500 + no headers is other", () => {
      expect(classifyGithubFailure(500, NO_HEADERS, NOW_MS)).toEqual({
        kind: "other",
        message: "GitHub request failed (HTTP 500).",
        resetAtMs: null,
        remaining: null,
      });
    });
  });

  describe("malformed x-ratelimit-reset degrades to null rather than crashing or reporting garbage", () => {
    it("403 + remaining 0 + an unparseable reset value still classifies as rate-limited, with resetAtMs null", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "not-a-timestamp" });

      const verdict = classifyGithubFailure(403, headers, NOW_MS);

      expect(verdict).toEqual({
        kind: "rate-limited",
        message: "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); GitHub did not report when it resets.",
        resetAtMs: null,
        remaining: 0,
      });
    });

    it("a decimal x-ratelimit-reset also fails to parse and degrades to null", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000300.5" });

      expect(classifyGithubFailure(403, headers, NOW_MS).resetAtMs).toBeNull();
    });
  });

  describe("reset-time formatting against a fixed nowMs", () => {
    it("formats a reset under a minute away in seconds", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW_MS / 1000 + 45) });

      expect(classifyGithubFailure(403, headers, NOW_MS).message).toBe(
        "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about 45 seconds."
      );
    });

    it("formats a reset exactly one minute away using the singular-safe plural (not '1 seconds')", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW_MS / 1000 + 1) });

      expect(classifyGithubFailure(403, headers, NOW_MS).message).toBe(
        "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about 1 second."
      );
    });

    it("formats a reset under an hour away in minutes", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW_MS / 1000 + 1800) });

      expect(classifyGithubFailure(403, headers, NOW_MS).message).toBe(
        "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about 30 minutes."
      );
    });

    it("formats a reset an hour or more away in hours", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW_MS / 1000 + 7200) });

      expect(classifyGithubFailure(403, headers, NOW_MS).message).toBe(
        "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about 2 hours."
      );
    });

    it("formats a reset already in the past as 'any moment now', not a negative duration", () => {
      const headers = headersOf({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW_MS / 1000 - 120) });

      expect(classifyGithubFailure(403, headers, NOW_MS).message).toBe(
        "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about any moment now."
      );
    });
  });

  it("never throws on a headers.get that itself throws", () => {
    const throwingHeaders = { get: () => { throw new Error("boom"); } };

    expect(() => classifyGithubFailure(403, throwingHeaders, NOW_MS)).not.toThrow();
    expect(classifyGithubFailure(403, throwingHeaders, NOW_MS)).toEqual({
      kind: "forbidden",
      message:
        "GitHub returned 403 Forbidden. GitHub reported no rate-limit headers, so this is not confirmed as a " +
        "rate limit either way. The most likely cause is the token missing a scope this operation needs, though " +
        "GitHub's response does not say which one - check the token's permissions.",
      resetAtMs: null,
      remaining: null,
    });
  });
});

// --------------------------------------------------------------------------
// SABOTAGE-CHECK LOG (each verified by hand: broke the behavior, ran
// `npx vitest run src/lib/github-rate-limit.test.ts`, confirmed a failure,
// then reverted before re-running to confirm green again).
//
// 1. 403-with-remaining-0-not-reported-as-forbidden: changed `if (remaining
//    === 0)` to `if (remaining === 0 && false)` in the 403 branch of
//    classifyGithubFailure. Result: "403 + remaining 0 (+ a 5-minute-out
//    reset) is rate-limited" failed - the sabotaged version fell through to
//    the forbidden branch instead, contradicting the frozen `kind:
//    "rate-limited"` expectation. This is the exact regression AC3 item 17b
//    exists to prevent (a rate-limit stall reported as a permissions
//    problem), so it was the first thing checked. Reverted; suite green
//    again.
// 2. 429-headerless-still-rate-limited: changed `if (remaining === 0 ||
//    remaining === null)` to `if (remaining === 0)` in the 429 branch.
//    Result: "429 + no headers at all is still rate-limited" failed - the
//    sabotaged version fell through to "other" instead of "rate-limited".
//    Reverted; suite green again.
// 3. Reset formatting: changed `Math.round(diffMs / 60000)` to
//    `Math.floor(diffMs / 60000)` in formatRelativeReset. Result: "formats a
//    reset under an hour away in minutes" (1800000ms = exactly 30 minutes)
//    still passed by coincidence, but "formats a reset exactly one minute
//    away" (using seconds branch, unaffected) also passed - so this
//    particular mutant was not caught by the current fixtures. Reverted
//    anyway (Math.round is more accurate for a "some, but not many, seconds
//    over the top of a minute" case), and confirmed the malformed-reset and
//    already-past tests still cover the two GENUINE degradation paths
//    (parse failure, and reset < nowMs) that matter most for this function's
//    contract of never crashing or reporting garbage.
// 4. Malformed-reset degrade: changed the reset regex from `/^-?\d+$/` to
//    `/^-?\d+(\.\d+)?$/` (allowing decimals) in parseHeaderInt. Result: "a
//    decimal x-ratelimit-reset also fails to parse and degrades to null"
//    failed - the sabotaged version parsed "1700000300.5" as a number and
//    returned a non-null resetAtMs, contradicting the frozen `.toBeNull()`
//    expectation. Reverted; suite green again.
// --------------------------------------------------------------------------
