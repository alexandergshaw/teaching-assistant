/**
 * SEC9's per-user save rate limit, as a pure decision. Contract:
 * docs/lms-credentials-acceptance-criteria.md SEC9, E-UX3, E-UX4; tests:
 * ./lms-credential-save-limit.test.ts.
 *
 * WHY THIS EXISTS AT ALL. SEC9 names the exact shape of the risk: "'Host did
 * not answer' versus 'token rejected', timed, is a port scanner - a closed
 * port RSTs in milliseconds, a filtered port hangs." Once a signed-in user
 * can distinguish those two outcomes (plus the two more precise ones E-UX3
 * adds - see ./lms-credential-probe-outcome.ts), the credential-save form is
 * a reachability-and-content probe against ANY public https host, usable at
 * whatever throughput nothing stops. This module is that stop: given how many
 * times this user has already attempted a save recently, and the current
 * time, decide whether one more attempt may proceed.
 *
 * WHY THIS IS PURE - NO STORAGE, NO CLOCK, NO ENVIRONMENT. Both the attempt
 * history and "now" are passed in as plain data rather than read from a
 * database or `Date.now()` inside this module. That is what makes this
 * testable without a database, a fake timer library, or any mocking at all -
 * a test just constructs an array of numbers and calls the function. It is
 * also what keeps this module able to answer the identical question on the
 * client (to disable a submit button with a visible reason - this app's
 * "disabled with the reason visible" standard, the same reasoning
 * ./account-admin-rules.ts's own doc comment gives for the identical
 * design) and on the server (the actual enforcement), from one rule instead
 * of two that could drift.
 *
 * THE FOUR-OUTCOME PRECISION IN ./lms-credential-probe-outcome.ts IS
 * CONDITIONAL ON THIS MODULE BEING WIRED IN, NOT MERELY EXISTING. Writing
 * this file is not the requirement - CALLING `mayAttemptLmsCredentialSave`
 * before every probe, and actually refusing when it says not to, is. If a
 * future change stops calling this (or calls it but ignores a `false`
 * verdict), E-UX3's four distinguishable outcomes silently become exactly the
 * unthrottled scanning primitive SEC9 exists to prevent, even though this
 * file itself is untouched and its own tests stay green. There is no way for
 * a unit test on this module alone to catch that failure mode - it is a
 * wiring property of the caller, not a property of this function - which is
 * why it is written here in prose instead.
 *
 * WHY A MISCOUNT OR A BAD CLOCK READING FAILS CLOSED. `nowMs` defines the
 * window everything else in this function is measured against; if it is not
 * a real, finite instant, there is no meaningful window to compute at all, so
 * this refuses rather than guessing - the same "a miscount must fail closed,
 * not open" reasoning `canPerformAccountAction`'s last-owner check
 * (./account-admin-rules.ts) applies to a corrupted owner count. A caller
 * that always passes `Date.now()` will never hit this branch in production;
 * it exists so a defensive caller-side bug degrades toward refusing an
 * attempt, never toward granting unlimited ones.
 *
 * WHY A BAD ENTRY IN THE HISTORY ITSELF IS TREATED DIFFERENTLY - IGNORED, NOT
 * A REFUSAL. `recentAttempts` is server-maintained history (this module's own
 * doc comment above says it is never read from the network or from user
 * input), not a value an attacker supplies per request the way, say, a
 * user-typed host is. A single malformed or out-of-window entry among many
 * legitimate ones is far more likely to be a storage quirk (a format change,
 * a clock adjustment on the machine that recorded it) than an attempt to
 * defeat this check, and the OTHER entries in the same array still count
 * fully - nothing is lost by simply not counting the one that does not fit
 * the window. This is a narrower, better-justified claim than "ignore bad
 * data": it is "the window is defined as `(now - windowMs, now]`, full stop,"
 * and anything outside it does not count regardless of why it is outside it.
 */

/** How many save attempts may occur in one window before this refuses. */
export const LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS = 5;

/**
 * The trailing window, in milliseconds, `LMS_CREDENTIAL_SAVE_LIMIT_MAX_
 * ATTEMPTS` is measured over. Ten minutes: generous enough that a user who
 * mistypes a host or pastes the wrong tab's token a few times in a row in
 * quick succession is never the one who trips this, tight enough that a
 * reachability-and-content probe against a list of candidate hosts cannot run
 * at any throughput worth having.
 */
export const LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * The answer to "may this save attempt proceed right now". `retryAtMs` is
 * REQUIRED on the `false` branch, never optional - mirroring
 * `AccountActionVerdict`'s own required `reason` on its refusal branch
 * (./account-admin-rules.ts) - because a refusal a caller cannot say
 * anything concrete about ("try again... sometime") is not a refusal this
 * surface's own UX standard would allow through.
 */
export type LmsCredentialSaveLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAtMs: number };

/**
 * Decides whether a save attempt at `nowMs` may proceed, given `recentAttempts`
 * - the epoch-millisecond timestamp of every save attempt this module's
 * caller has recorded for this user (any institution, any outcome: SEC9's
 * limit is on ATTEMPTS, not on failures, because a successful save this
 * function let through still used one of the user's own network round trips
 * and must count the same as any other).
 *
 * Total and side-effect-free: never throws, never reads a clock, never reads
 * or writes storage. A non-finite `nowMs` refuses outright (see the module
 * doc comment); every entry in `recentAttempts` that does not fall in the
 * half-open window `(nowMs - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS, nowMs]` -
 * too old, non-finite, or dated after `nowMs` - simply does not count toward
 * the limit, rather than being treated as a separate failure mode.
 */
export function mayAttemptLmsCredentialSave(
  recentAttempts: readonly number[],
  nowMs: number
): LmsCredentialSaveLimitDecision {
  if (!Number.isFinite(nowMs)) {
    // There is no real window to compute from a clock reading that is not a
    // real instant - refuse rather than guess. `Number.POSITIVE_INFINITY` as
    // `retryAtMs` says plainly "not computable from this input," rather than
    // fabricating a plausible-looking timestamp; a caller that always passes
    // a real `Date.now()` never reaches this branch.
    return { allowed: false, retryAtMs: Number.POSITIVE_INFINITY };
  }

  const windowStart = nowMs - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS;
  const withinWindow = recentAttempts
    .filter((t) => Number.isFinite(t) && t > windowStart && t <= nowMs)
    .sort((a, b) => a - b);

  if (withinWindow.length < LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: true };
  }

  // Refused: the window will next have room for one more attempt exactly
  // LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS after its OLDEST currently-counted
  // attempt - a genuine sliding window, not a fixed reset point that would
  // let every refused user's limit reset in lockstep at the top of the hour.
  const oldestInWindow = withinWindow[0];
  return { allowed: false, retryAtMs: oldestInWindow + LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS };
}

