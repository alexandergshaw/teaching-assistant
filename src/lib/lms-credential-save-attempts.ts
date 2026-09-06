// Persistence for public.lms_credential_save_attempts - a per-user log of
// Canvas credential save/probe attempts, backing SEC9's rate limit
// (docs/lms-credentials-acceptance-criteria.md; ./lms-credential-save-limit.ts
// owns the ALLOW/DENY decision itself). See
// supabase/migrations/20261016000000_lms_credential_save_attempts.sql for the
// schema, why the primary key is a bare surrogate id, why this table never
// upserts, how rows are removed, and the RLS shape (zero policies for
// `authenticated` - every access here uses the service-role client, which
// bypasses RLS and carries no JWT).
//
// THIS IS THE ONLY MODULE THAT TOUCHES public.lms_credential_save_attempts,
// in either direction - mirrors ./lms-credentials.ts's own "this is the only
// module that writes" rule for public.lms_credentials.
//
// THIS MODULE SUPPLIES DATA; IT DOES NOT JUDGE. It has no opinion about how
// many attempts are too many, what the window length is, or what happens
// when a caller is refused - every one of those questions belongs to
// mayAttemptLmsCredentialSave (./lms-credential-save-limit.ts), a pure
// function this module does not even import. That separation is why this
// module's two exports take plain numbers (`sinceMs`, `nowMs`, `retentionMs`)
// from their caller rather than reading a shared constant themselves: a
// change to the rate limit's window or its threshold never has to touch this
// file, and this file changing (a different retention policy, a different
// column) never has to touch the decision.
//
// FAIL CLOSED IS THE WHOLE POINT OF THIS MODULE'S SHAPE (the part of this
// change most likely to be gotten wrong - see the caller, checkAndRecordAttempt
// in src/app/account/integrations/lms-actions.ts). getRecentLmsCredentialSave
// Attempts returns `null` - NOT an empty array - when the read itself fails,
// specifically so a caller cannot mistake "we could not find out how many
// attempts this user has made" for "this user has made zero attempts."
// Collapsing those two into one value (the way ./lms-credentials.ts's own
// getLmsCredentialSecret deliberately DOES collapse "no row" and "could not
// decrypt" into the same `null`, because both cases correctly resolve to the
// SAME caller action - "ask the user to reconnect") would be the wrong choice
// here, because the two cases correctly resolve to OPPOSITE caller actions: a
// database that is merely slow must refuse the attempt, not silently let it
// through because it looked the same as an empty history. A rate limiter that
// disables itself the moment the database it depends on is briefly degraded
// is worse than no rate limiter at all, because unlike "no rate limiter" it is
// actually trusted to be doing something.
//
// USER ID NEVER RESOLVED HERE (matches ./lms-credentials.ts's own rule,
// E-ARCH4 in the acceptance doc). Both exports take `userId` as a plain
// parameter and do nothing to authenticate it; deciding which user id a
// request may act as is entirely the caller's job.
//
// NOTHING BUT "WHO, AND WHEN" IS EVER WRITTEN HERE. No institution, no base
// URL, no token fragment, no probe outcome - see the migration's own header
// for why. If a future change to this module ever wants to persist anything
// else about an attempt, stop and re-read that reasoning first.

import { createServiceClient } from "./supabase/server";
import type { LmsCredentialSaveAttemptsRow, LmsCredentialSaveAttemptsInsert } from "./supabase/types.tables-c";

function table() {
  // Typed Supabase selects collapse to `never` in this repo's compiled client
  // generics (see src/lib/supabase/app-users.ts's own comment on the same
  // issue, and ./lms-credentials.ts's identical `table()` helper) - reached
  // through an `any` cast, with the row shape applied explicitly at each call
  // site below via LmsCredentialSaveAttemptsRow/Insert instead. This table is
  // deliberately NOT added to the `Database` interface in ./supabase/types.ts
  // (out of this change's file set) - the `any` cast here means it does not
  // need to be, exactly like the pattern this comment already points to.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("lms_credential_save_attempts");
}

/**
 * How long a single attempt-history read may take, and why retries are OFF -
 * copied verbatim from ./lms-credentials.ts's own
 * CREDENTIAL_READ_TIMEOUT_MS/getLmsCredentialSecret doc comment (E-REL1 in
 * the acceptance doc), because the reasoning is identical fact for fact, not
 * merely similar:
 *
 * THE BOUND. This is an indexed lookup on `(user_id, attempted_at)` - a small
 * range scan bounded to at most LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS rows
 * per user, not an unbounded scan - so it has the credential read's shape, a
 * cheap point-ish read, not a heavier aggregate query. Five seconds is
 * generous for that and short enough to leave the caller budget left.
 *
 * THE RETRY, which is the part that actually matters. `AbortSignal.timeout()`
 * rejects with a DOMException named "TimeoutError", and postgrest-js checks
 * for "AbortError" before deciding a failure is non-retryable. "TimeoutError"
 * does not match, so a timed-out SELECT is treated as an ordinary retryable
 * network error and re-runs up to three more times with fresh timeouts and
 * backoff - roughly 4 x 5s of timeout plus backoff for ONE degraded read.
 *
 * That cost cannot be absorbed here either. This read happens after
 * requireUser() has already resolved who the caller is (a read of its own)
 * and before the Canvas probe this whole rate limit exists to gate - three
 * reads/calls in series, none of which can be issued together, because each
 * needs the previous one's answer. A retried, unbounded read here would put
 * this exact function on the same 60-second-cap collision E-REL1 already
 * names for the credential read, one call earlier in the same chain.
 *
 * So retries are disabled deliberately, for the identical reason
 * ./lms-credentials.ts gives: a read that cannot complete quickly has a
 * correct answer already - refuse the attempt (see this module's header on
 * failing closed) - and that answer does not improve with three more tries.
 *
 * Do not raise this bound or re-enable retries without redoing that
 * arithmetic against whatever the platform cap is at the time.
 */
const ATTEMPT_READ_TIMEOUT_MS = 5_000;

/**
 * The epoch-millisecond timestamp of every save/probe attempt `userId` has
 * made at or after `sinceMs` (inclusive) - the raw material
 * mayAttemptLmsCredentialSave (./lms-credential-save-limit.ts) needs to
 * compute a genuine sliding window, not a pre-computed count. Returns `null`
 * - NEVER an empty array - when the read itself failed; see this module's
 * header for why that distinction is the one property this function exists
 * to get right. A caller that treats `null` the same as `[]` has silently
 * turned this rate limit off.
 */
export async function getRecentLmsCredentialSaveAttempts(userId: string, sinceMs: number): Promise<number[] | null> {
  const { data, error } = await table()
    .select("attempted_at")
    .eq("user_id", userId)
    .gte("attempted_at", new Date(sinceMs).toISOString())
    .abortSignal(AbortSignal.timeout(ATTEMPT_READ_TIMEOUT_MS))
    .retry(false);

  if (error) {
    console.error("[lms-credential-save-attempts] Could not read recent attempts:", error.message);
    return null;
  }

  const rows = (data ?? []) as Array<Pick<LmsCredentialSaveAttemptsRow, "attempted_at">>;
  return rows.map((row) => new Date(row.attempted_at).getTime());
}

/**
 * Records one attempt for `userId` at `nowMs`, then sweeps this SAME user's
 * rows older than `nowMs - retentionMs` in the same call (the migration's
 * "cleanup on write" - see its header for why there is no separate scheduled
 * job). `retentionMs` is supplied by the caller rather than read from
 * ./lms-credential-save-limit.ts here, for the same reason
 * `getRecentLmsCredentialSaveAttempts`'s `sinceMs` is: this module has no
 * opinion about the rate limit's own parameters and does not import them.
 *
 * THROWS if the insert itself fails - deliberately, unlike
 * ./lms-credentials.ts's best-effort touchLmsCredentialUsed/
 * recordLmsCredentialFailure. Those two are best-effort because a failure to
 * write a USE-timestamp or a diagnostic must never turn an already-successful
 * Canvas call into a reported error. Here, failing to record an attempt this
 * function's caller has just been told is ALLOWED means the next check
 * cannot see it, which would make the rate limit progressively weaker every
 * time a write happens to fail - so the caller (checkAndRecordAttempt in
 * src/app/account/integrations/lms-actions.ts) catches this and fails the
 * attempt CLOSED, exactly as it does for a failed read.
 *
 * The cleanup delete, by contrast, IS best-effort and never throws: a swept
 * row is never counted again regardless (the read above already filters by
 * `sinceMs`), so a failed sweep only affects table size, never correctness -
 * logging and moving on is the same judgment
 * ./lms-credentials.ts's touchLmsCredentialUsed makes for its own update.
 */
export async function recordLmsCredentialSaveAttempt(
  userId: string,
  nowMs: number,
  retentionMs: number
): Promise<void> {
  const row: LmsCredentialSaveAttemptsInsert = {
    user_id: userId,
    attempted_at: new Date(nowMs).toISOString(),
  };

  const { error: insertError } = await table().insert(row);
  if (insertError) {
    throw new Error(`Could not record a Canvas credential attempt: ${insertError.message}`);
  }

  const { error: deleteError } = await table()
    .delete()
    .eq("user_id", userId)
    .lt("attempted_at", new Date(nowMs - retentionMs).toISOString());
  if (deleteError) {
    console.error("[lms-credential-save-attempts] Could not sweep old attempts:", deleteError.message);
  }
}
