// Repo Grades view - AC3 item 17b (docs/repo-grades-view-acceptance-criteria.md).
//
// This codebase has NO rate-limit handling anywhere: no `x-ratelimit-*` read,
// no `Retry-After`, no backoff. Worse, the one place that already turns a 403
// into user-facing text - ghError's 403 branch at src/lib/github.repos.ts:20 -
// GUESSES between two unrelated causes in a single message: "rate limit hit
// or the token lacks the needed scope." A real throttle therefore reads to
// the user exactly like a broken token, and there is no way from that
// message alone to tell which one actually happened.
//
// classifyGithubFailure is the fix: given a response's status, its headers,
// and the current time, it decides which of three things happened:
//   - "rate-limited" - GitHub itself said so (`x-ratelimit-remaining: "0"` on
//     a 403 or 429, or a bare 429 with no rate-limit headers at all - GitHub's
//     secondary/abuse-detection 429s frequently carry no x-ratelimit-* headers,
//     but the 429 status code alone is already unambiguous). The verdict
//     carries the reset time (from `x-ratelimit-reset`, UNIX seconds converted
//     to ms) when GitHub reported one, and states it in human terms relative
//     to the caller-supplied `nowMs`.
//   - "forbidden" - a 403 that is NOT confirmed as a rate limit (remaining is
//     a positive number, or no rate-limit headers were present at all to
//     confirm either way). The message names a missing token scope as the
//     LIKELY cause, because that is genuinely the most common reason for a
//     bare 403, but it never invents a scope name - this function has no way
//     to know which scope, and claiming otherwise would just replace one
//     guess with a more confident-sounding one.
//   - "other" - anything not covered above (401, 404, 500, a 429 that reports
//     a positive remaining count, etc.). These already have reasonably honest
//     messages elsewhere (see ghError's 401/404/422 branches) - this function
//     does not try to out-guess them, it just names the status.
//
// Pure: no fetch, no Date.now() default anywhere in this file. `nowMs` is a
// required parameter, not read from the clock internally, specifically so
// this function is deterministic and testable without faking global time.
// Never throws - a missing or malformed header degrades to "unknown", it
// never becomes an exception that could take down the caller's per-repo loop
// (src/lib/repo-grade-tree-scan.ts leans on that guarantee for AC3 item 17c's
// per-repo isolation).

export type GithubLimitKind = "rate-limited" | "forbidden" | "other";

export interface GithubLimitVerdict {
  kind: GithubLimitKind;
  message: string;
  /** UNIX ms the primary rate limit resets, from `x-ratelimit-reset` (UNIX
   * seconds, converted here). Null when the header was absent, malformed, or
   * not meaningful for this verdict's kind (always null for "other", and for
   * "forbidden" since a non-confirmed rate limit has no reset to report). */
  resetAtMs: number | null;
  /** Requests remaining on the primary quota, from `x-ratelimit-remaining`.
   * Null when the header was absent or malformed, or not meaningful for this
   * verdict's kind (always null for "other"). */
  remaining: number | null;
}

/** A minimal reader over a header value, matching the subset of the Fetch
 * API's `Headers` this module actually needs - accepting the interface
 * rather than the concrete `Headers` class keeps this file free of any DOM
 * lib dependency and lets tests hand in a plain object or a real `Headers`
 * interchangeably. */
interface HeaderReader {
  get(name: string): string | null;
}

/** Reads `name` off `headers` and parses it as a base-10 integer. Returns
 * null for a missing header, a header read that itself throws (a defensive
 * guard - nothing in this codebase's `Headers` usage is known to throw, but
 * this function must never crash regardless of what it is handed), or a
 * value that is not a plain integer string (so "0.5", "abc", "" and "-1abc"
 * all degrade to null rather than silently coercing through `Number()`). */
function parseHeaderInt(headers: HeaderReader, name: string): number | null {
  let raw: string | null;
  try {
    raw = headers.get(name);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Describes `resetAtMs` in human terms relative to `nowMs`: seconds when
 * under a minute away, minutes when under an hour, hours beyond that, and
 * "any moment now" for a reset that has already passed (a delayed check can
 * observe a reset time slightly in the past - this is not an error state). */
function formatRelativeReset(resetAtMs: number, nowMs: number): string {
  const diffMs = resetAtMs - nowMs;
  if (diffMs <= 0) return "any moment now";
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(diffMs / 3600000);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function rateLimitedMessage(status: number, remaining: number | null, resetAtMs: number | null, nowMs: number): string {
  const remainingText = remaining !== null ? `${remaining} request${remaining === 1 ? "" : "s"} remaining` : "no remaining count reported";
  const resetText = resetAtMs !== null ? `it resets in about ${formatRelativeReset(resetAtMs, nowMs)}` : "GitHub did not report when it resets";
  return `GitHub's API rate limit was hit (HTTP ${status}, ${remainingText}); ${resetText}.`;
}

function forbiddenMessage(remaining: number | null): string {
  const confirmation =
    remaining !== null
      ? ` This is not a rate limit (${remaining} request${remaining === 1 ? "" : "s"} remaining on the primary quota).`
      : " GitHub reported no rate-limit headers, so this is not confirmed as a rate limit either way.";
  return (
    `GitHub returned 403 Forbidden.${confirmation} The most likely cause is the token missing a scope this ` +
    `operation needs, though GitHub's response does not say which one - check the token's permissions.`
  );
}

/**
 * Classifies a failed GitHub API response as genuinely rate-limited, merely
 * forbidden, or something else, so a throttle is never reported to the user
 * as a permissions problem (AC3 item 17b). See the module header for the
 * full decision rule and rationale for each branch.
 */
export function classifyGithubFailure(status: number, headers: HeaderReader, nowMs: number): GithubLimitVerdict {
  const remaining = parseHeaderInt(headers, "x-ratelimit-remaining");
  const resetSeconds = parseHeaderInt(headers, "x-ratelimit-reset");
  const resetAtMs = resetSeconds !== null ? resetSeconds * 1000 : null;

  if (status === 403) {
    if (remaining === 0) {
      return { kind: "rate-limited", message: rateLimitedMessage(status, remaining, resetAtMs, nowMs), resetAtMs, remaining };
    }
    // remaining > 0, or no rate-limit headers at all (remaining === null) -
    // both cases read the same way: GitHub did not confirm this as a rate
    // limit, so it is reported as "forbidden", not "rate-limited".
    return { kind: "forbidden", message: forbiddenMessage(remaining), resetAtMs: null, remaining };
  }

  if (status === 429) {
    if (remaining === 0 || remaining === null) {
      // remaining === 0 matches the shared 403-or-429 rule; remaining ===
      // null covers "a 429 with no headers is still rate-limited" - the 429
      // status code is itself the confirmation here, since GitHub's
      // secondary/abuse-detection throttling frequently omits the
      // x-ratelimit-* headers entirely.
      return { kind: "rate-limited", message: rateLimitedMessage(status, remaining, resetAtMs, nowMs), resetAtMs, remaining };
    }
    // A 429 that reports a positive remaining count on the PRIMARY quota is
    // not one of the two documented rate-limited shapes - GitHub does not
    // actually produce this combination in practice, but this function must
    // still resolve it to something rather than guess, so it falls to "other".
  }

  return { kind: "other", message: `GitHub request failed (HTTP ${status}).`, resetAtMs: null, remaining: null };
}
