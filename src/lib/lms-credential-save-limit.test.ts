import { describe, expect, it } from "vitest";
import {
  LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS,
  LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS,
  mayAttemptLmsCredentialSave,
} from "./lms-credential-save-limit";

/**
 * Contract tests for SEC9's per-user save rate limit (docs/lms-credentials-
 * acceptance-criteria.md SEC9, E-UX3).
 *
 * WHY THIS MATTERS BEYOND ITS OWN FILE. E-UX3's four distinguishable probe
 * outcomes are only safe to expose because this limit exists - see this
 * module's own doc comment, and ./lms-credential-probe-outcome.ts's. These
 * tests only prove the arithmetic in this file; they cannot prove the limit
 * is actually CALLED before every probe, which is a property of the caller,
 * not of this function.
 */

const NOW = 1_700_000_000_000; // an arbitrary, fixed instant

describe("mayAttemptLmsCredentialSave - the happy path", () => {
  it("allows the very first attempt with no history at all", () => {
    expect(mayAttemptLmsCredentialSave([], NOW)).toEqual({ allowed: true });
  });

  it("allows an attempt when fewer than the max have happened in the window", () => {
    const history = Array.from({ length: LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS - 1 }, (_, i) => NOW - i * 1000);
    expect(mayAttemptLmsCredentialSave(history, NOW)).toEqual({ allowed: true });
  });

  it("ignores attempts that fell outside the window - they do not count against a fresh attempt", () => {
    const longAgo = NOW - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS - 1;
    const history = Array.from({ length: 50 }, () => longAgo);
    expect(mayAttemptLmsCredentialSave(history, NOW)).toEqual({ allowed: true });
  });
});

describe("mayAttemptLmsCredentialSave - refusing at the limit", () => {
  it("refuses the attempt that would be the (max + 1)th within the window", () => {
    const history = Array.from({ length: LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS }, (_, i) => NOW - i * 1000);
    const decision = mayAttemptLmsCredentialSave(history, NOW);
    expect(decision.allowed).toBe(false);
  });

  it("names a real, later retryAtMs - exactly the oldest counted attempt plus one full window", () => {
    const oldest = NOW - 9 * 60 * 1000; // 9 minutes ago, still inside the 10-minute window
    const history = [oldest, NOW - 5000, NOW - 4000, NOW - 3000, NOW - 2000];
    const decision = mayAttemptLmsCredentialSave(history, NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.retryAtMs).toBe(oldest + LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
    expect(decision.allowed === false && decision.retryAtMs).toBeGreaterThan(NOW);
  });

  it("counts an attempt exactly AT the current instant", () => {
    const history = Array.from({ length: LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS - 1 }, () => NOW);
    history.push(NOW);
    expect(mayAttemptLmsCredentialSave(history, NOW).allowed).toBe(false);
  });

  it("does not count an attempt exactly at the window's own start boundary (exclusive)", () => {
    const boundary = NOW - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS;
    const history = Array.from({ length: LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS }, () => boundary);
    expect(mayAttemptLmsCredentialSave(history, NOW)).toEqual({ allowed: true });
  });
});

describe("mayAttemptLmsCredentialSave - malformed input fails safely", () => {
  it("fails closed (refuses) when nowMs is not a finite number", () => {
    for (const badNow of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const decision = mayAttemptLmsCredentialSave([], badNow);
      expect(decision.allowed, `now=${String(badNow)}`).toBe(false);
    }
  });

  it("does not let a NaN or future-dated history entry count toward the limit", () => {
    const future = NOW + 60_000;
    const history = [Number.NaN, future, future, future, future, future];
    // None of these fall inside (windowStart, now], so this must still allow.
    expect(mayAttemptLmsCredentialSave(history, NOW)).toEqual({ allowed: true });
  });

  it("still refuses correctly when garbage entries are mixed in with enough real ones", () => {
    const real = Array.from({ length: LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS }, (_, i) => NOW - i * 1000);
    const history = [Number.NaN, NOW + 60_000, ...real];
    expect(mayAttemptLmsCredentialSave(history, NOW).allowed).toBe(false);
  });
});

// ============================================================================
// Sabotage check performed during implementation (reported in Definition of
// Done): temporarily changed the boundary comparison from `t > windowStart`
// to `t >= windowStart` and reran this file. "does not count an attempt
// exactly at the window's own start boundary (exclusive)" went red (it
// expected `allowed: true` and the mutation made it count the boundary entry,
// tipping five counted attempts into a refusal), proving that test actually
// exercises the exclusive/inclusive choice rather than passing by
// coincidence. Reverted, and the suite is green again.
