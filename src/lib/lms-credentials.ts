// Persistence for public.lms_credentials - a signed-in user's own Canvas
// base URL and personal access token, one row per (user, institution). See
// supabase/migrations/20261015000000_lms_credentials.sql for the schema, the
// RLS shape (zero policies for `authenticated` - every access here uses the
// service-role client, which bypasses RLS and carries no JWT, so
// `auth.uid()` is null under it regardless), and why there is no foreign key
// to an institutions table. Contract: docs/lms-credentials-acceptance-
// criteria.md, especially E1-E2, DAT3, DAT4, SEC6-SEC8, E-REL5, E-REL6.
//
// THIS IS THE ONLY MODULE THAT TOUCHES public.lms_credentials, in either
// direction. Mirrors src/lib/supabase/app-users.ts's own rule for
// public.app_users: every other file that needs a Canvas credential - the
// fetch wrapper, the resolver, the settings actions, an admin listing -
// calls into this module rather than opening its own `.from("lms_credentials")`.
// That is what keeps the AAD binding (below), the decrypt-failure recovery
// shape, and the failure-diagnostic writes all correct in exactly one place
// instead of needing to be re-derived correctly at every call site.
//
// FIVE EXPORTS ARE A FROZEN CONTRACT other in-flight groups of this same
// feature are coding against concurrently: getLmsCredentialSecret,
// listLmsCredentials, saveLmsCredential, deleteLmsCredential,
// touchLmsCredentialUsed. Their signatures must not change without updating
// every caller. recordLmsCredentialFailure is an ADDITIONAL export, not part
// of that frozen set, added because the E-REL6 diagnostic columns need
// exactly one writer too - see its own doc comment.
//
// USER ID NEVER RESOLVED HERE (E-ARCH4). Every export below takes `userId`
// as a plain parameter and does nothing to authenticate or authorize it -
// this module answers "what does THIS user id have stored", full stop.
// Deciding which user id a request is entitled to act as (requireUser(),
// getImpersonatedOwner(), or similar) is the caller's job, exactly as
// app-users.ts's own header states for that table. A user id that reached
// this module from anywhere other than server-verified ambient state is a
// caller bug, not something this module can detect or prevent.
//
// AAD BINDS EACH TOKEN TO ITS OWN ROW (SEC7). Every encryptSecret/
// decryptSecret call below passes `aad(userId, institution)` - the row's own
// primary key, normalized. A ciphertext that somehow ended up written under
// the wrong row (a copy-paste bug, a batch script gone wrong, anything that
// is not this module's own upsert) fails AES-GCM authentication instead of
// quietly decrypting into a token that works for the wrong account. This
// costs nothing on the happy path: every legitimate row was written with its
// own (userId, institution) as the aad, so it always matches itself.
//
// DECRYPT FAILURE NEVER THROWS OUT OF A READ PATH (copied from
// src/lib/microsoft-credentials.ts's shape, deliberately NOT from
// src/lib/google-credentials.ts's - see getLmsCredentialSecret's own doc
// comment). A rotated-past key, a tampered row, or any other decrypt failure
// collapses into the same `null` this module already returns for "nothing
// stored" - "please reconnect Canvas" is the only recovery a caller could
// offer either way, and a caller that cannot tell the two apart cannot
// accidentally treat one as fatal when it should have been recoverable.

import { createServiceClient } from "./supabase/server";
import type { Database } from "./supabase/types";
import { encryptSecret, decryptSecret } from "./crypto";

type CredentialsTable = Database["public"]["Tables"]["lms_credentials"];
type DbRow = CredentialsTable["Row"];
type DbInsert = CredentialsTable["Insert"];
type DbUpdate = CredentialsTable["Update"];

/**
 * The closed vocabulary a stored failure diagnostic may take (E-REL6) -
 * matches the migration's CHECK constraint exactly, value for value, so a
 * mismatch between this union and the database constraint would surface as
 * every write failing loudly (a 23514 check-violation) rather than silently
 * storing something the constraint quietly disagreed with.
 *
 * 'no_credential' is included for completeness against the acceptance
 * criteria's own four-value list, but note that it can never actually be
 * written by recordLmsCredentialFailure below: that failure means NO row
 * exists for the (userId, institution) pair, and there is no row to stamp a
 * diagnostic onto. It is flagged here, and again in the migration and in
 * this change's report, rather than silently omitted or silently
 * implemented as a no-op nobody explained.
 */
export type LmsCredentialFailureKind = "unreadable" | "rejected" | "host_unreachable";

/**
 * The operator's diagnostic vocabulary has a FOURTH state - "this user has
 * no credential for this institution" - which is deliberately NOT a member
 * of the type above, because it is represented by ROW ABSENCE. There is no
 * row to stamp it on, so a column value for it could never be written, and
 * a domain that permits an unwritable value is one somebody eventually
 * writes by hand. The database CHECK constraint agrees: three values.
 */

/** The shape a settings surface (E5) or an admin listing (E-ADM5) may render - metadata and the token's last four characters only. NEVER the decrypted token: listLmsCredentials (below) does not decrypt to build this, by construction. */
export interface LmsCredentialSummary {
  institution: string;
  baseUrl: string;
  tokenLastFour: string;
  canvasUserId: string | null;
  canvasUserName: string | null;
  lastVerifiedAt: string | null;
  lastUsedAt: string | null;
  lastFailureAt: string | null;
  lastFailureKind: LmsCredentialFailureKind | null;
  createdAt: string;
  updatedAt: string;
}

/** Input to saveLmsCredential - every field the E4 verification probe must have already produced before this is ever called. This module does not call Canvas itself and does not validate the URL itself (src/lib/lms-credential-rules.ts owns both); it only ever persists what a caller who already did both hands it. */
export interface SaveLmsCredentialInput {
  userId: string;
  institution: string;
  /** Already validated (validateLmsBaseUrl) and normalized (normalizeLmsBaseUrl) by the caller - this module stores it verbatim and does not re-run either check, since re-validating a security boundary a second time in a second module is exactly the "two copies that must agree" hazard docs/lms-credentials-acceptance-criteria.md's E-ARCH5 warns against for the address classifier. */
  baseUrl: string;
  /** The plaintext token. Never returned by any export in this module once this call completes - see the module header. */
  token: string;
  canvasUserId: string;
  canvasUserName: string | null;
}

/** Normalizes an institution acronym exactly like google-credentials.ts / microsoft-credentials.ts / src/lib/institutions.ts already do, so the same acronym is one credential across all three provider tables and the client's localStorage registry. */
function normalizeInstitution(institution: string): string {
  return institution.trim().toUpperCase();
}

/** The AAD bound into every encrypted_token for this table (SEC7) - the row's own primary key, so a ciphertext only ever authenticates back to the exact (user, institution) pair it was written for. A shared helper rather than an inline template string at each of the three call sites below, so encrypt and both decrypt call sites are structurally guaranteed to derive it the same way. */
function rowAad(userId: string, institution: string): string {
  return `${userId}:${institution}`;
}

function table() {
  // Typed Supabase selects collapse to `never` in this repo's compiled
  // client generics (see src/lib/supabase/app-users.ts's own comment on the
  // same issue) - reached through an `any` cast, exactly like
  // google-credentials.ts and microsoft-credentials.ts already do, with the
  // row types applied explicitly by this file's own mapper instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("lms_credentials");
}

/**
 * Map a raw lms_credentials row (snake_case, minus encrypted_token - see
 * listLmsCredentials, the only caller) into the camelCase summary shape the
 * rest of the app reads. Exported so the mapping is unit-testable without a
 * live Supabase client, mirroring mapAppUserRow in src/lib/supabase/app-users.ts.
 */
export function mapLmsCredentialRow(row: Omit<DbRow, "user_id" | "encrypted_token">): LmsCredentialSummary {
  return {
    institution: row.institution,
    baseUrl: row.base_url,
    tokenLastFour: row.token_last_four,
    canvasUserId: row.canvas_user_id,
    canvasUserName: row.canvas_user_name,
    lastVerifiedAt: row.last_verified_at,
    lastUsedAt: row.last_used_at,
    lastFailureAt: row.last_failure_at,
    lastFailureKind: row.last_failure_kind as LmsCredentialFailureKind | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Read and decrypt the stored Canvas token for a user + institution, or null
 * when there is nothing usable - either no row at all, or a row this process
 * cannot decrypt (a rotated-past key, or genuine tampering; crypto.ts's own
 * contract cannot tell the two apart - see its decryptSecret doc comment).
 *
 * COPIES src/lib/microsoft-credentials.ts's shape here: a decrypt failure is
 * caught and treated as "not connected", never thrown. It deliberately does
 * NOT copy src/lib/google-credentials.ts's now-fixed history of once letting
 * that same failure escape uncaught as a 500 (DAT5/E-ARCH note in the
 * acceptance doc) - every caller of this function gets exactly one failure
 * shape to handle (null means "ask the user to reconnect Canvas"), never a
 * thrown error that a caller could forget to catch.
 */
/**
 * How long a single credential read may take, and why retries are OFF.
 *
 * THE BOUND. This is one indexed primary-key lookup on `(user_id,
 * institution)`, so it has the request gate's shape - a point read - not the
 * account list's scan-and-aggregate shape that justified the longer default
 * elsewhere. Five seconds is generous for a point read and short enough that
 * the caller still has budget left.
 *
 * THE RETRY, which is the part that actually matters. `AbortSignal.timeout()`
 * rejects with a DOMException named "TimeoutError", and postgrest-js checks
 * for "AbortError" before deciding a failure is non-retryable. "TimeoutError"
 * does not match, so a timed-out SELECT is treated as an ordinary retryable
 * network error and re-runs up to three more times, each with a FRESH
 * timeout, separated by exponential backoff - roughly 4 x 5s + 7s of backoff
 * for ONE degraded read.
 *
 * That cost cannot be absorbed here. Reading a credential requires already
 * knowing who the caller is, so this read is necessarily IN SERIES behind the
 * request guard's own profile read - the two cannot be issued together the
 * way an independent pair can. Two retried reads in series exceed the
 * platform's 60-second function cap before a single byte reaches Canvas, and
 * the request dies with no page rather than a slow one.
 *
 * So retries are disabled deliberately. A credential read has a CORRECT
 * ANSWER ON FAILURE - "we cannot tell whether you have a credential, so do
 * not spend a token" - and that answer does not improve with three more
 * attempts. Retrying is only worth thirty-four seconds of a sixty-second
 * budget when the retry might succeed AND the caller could still use the
 * result; here it can do neither.
 *
 * Do not raise this bound or re-enable retries without redoing that
 * arithmetic against whatever the cap is at the time.
 */
const CREDENTIAL_READ_TIMEOUT_MS = 5_000;

export async function getLmsCredentialSecret(
  userId: string,
  institution: string
): Promise<{ baseUrl: string; token: string } | null> {
  const normalized = normalizeInstitution(institution);
  const { data, error } = await table()
    .select("base_url, encrypted_token")
    .eq("user_id", userId)
    .eq("institution", normalized)
    .abortSignal(AbortSignal.timeout(CREDENTIAL_READ_TIMEOUT_MS))
    .retry(false)
    .maybeSingle();

  if (error) {
    console.error("[lms-credentials] Could not read a credential:", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as Pick<DbRow, "base_url" | "encrypted_token">;

  try {
    const token = decryptSecret(row.encrypted_token, rowAad(userId, normalized));
    return { baseUrl: row.base_url, token };
  } catch (decryptError) {
    // Never log the ciphertext or any decrypted value - only the error's own
    // message, which crypto.ts guarantees never contains either (see its own
    // doc comments on what a decrypt failure can and cannot distinguish).
    console.error(
      "[lms-credentials] Could not decrypt a stored Canvas token; treating as not connected.",
      decryptError instanceof Error ? decryptError.message : String(decryptError)
    );
    return null;
  }
}

/**
 * Every credential this user has registered, across every institution -
 * metadata and the token's last four characters ONLY (DAT3). Deliberately
 * selects every column EXCEPT encrypted_token, rather than selecting `*` and
 * discarding it after the fact in JavaScript: the ciphertext never leaves
 * Postgres for this call at all, which is what makes "this function never
 * decrypts" a property of the query itself, not just of this function's
 * current implementation.
 */
export async function listLmsCredentials(userId: string): Promise<LmsCredentialSummary[]> {
  const { data, error } = await table()
    .select(
      "institution, base_url, token_last_four, canvas_user_id, canvas_user_name, last_verified_at, last_used_at, last_failure_at, last_failure_kind, created_at, updated_at"
    )
    .eq("user_id", userId);

  if (error) {
    console.error("[lms-credentials] Could not list credentials:", error.message);
    return [];
  }

  const rows = (data ?? []) as Array<Omit<DbRow, "user_id" | "encrypted_token">>;
  return rows
    .map((row) => mapLmsCredentialRow(row as Omit<DbRow, "user_id" | "encrypted_token">))
    .sort((a, b) => a.institution.localeCompare(b.institution));
}

/**
 * Verify-then-store is the CALLER's job (E4's mandatory Canvas probe runs
 * before this is ever invoked); this function performs the encrypt-and-write
 * half only, and always treats the call as a successful (re)connection:
 *   - token_last_four is recomputed from the fresh plaintext every time, so
 *     replacing a token always shows the NEW last four, never a stale value
 *     from whatever was there before.
 *   - last_verified_at is stamped to now() unconditionally - reaching this
 *     function at all means the caller's own E4 probe just succeeded.
 *   - last_failure_at/last_failure_kind are cleared to null: a save that
 *     reaches this point means whatever was previously wrong (if anything)
 *     no longer is, and a stale failure diagnostic surviving a successful
 *     reconnect would be actively misleading (E-REL6 exists to report the
 *     CURRENT state, not a permanent scar).
 *   - created_at is deliberately absent from the written row: PostgREST's
 *     upsert only sets columns actually present in the payload, so on a
 *     genuine INSERT the column default (now()) applies, and on an UPDATE
 *     (replacing an existing credential) the original created_at is left
 *     untouched - exactly like google-credentials.ts/microsoft-credentials.ts
 *     already leave their own created-at-equivalent columns alone on replace.
 *
 * onConflict is "user_id,institution" - the composite PRIMARY KEY (DAT4),
 * not a partial index, which is what lets PostgREST infer a real constraint
 * for ON CONFLICT instead of raising 42P10.
 */
export async function saveLmsCredential(input: SaveLmsCredentialInput): Promise<LmsCredentialSummary> {
  const normalized = normalizeInstitution(input.institution);
  const now = new Date().toISOString();

  const row: DbInsert = {
    user_id: input.userId,
    institution: normalized,
    base_url: input.baseUrl,
    encrypted_token: encryptSecret(input.token, rowAad(input.userId, normalized)),
    token_last_four: input.token.slice(-4),
    canvas_user_id: input.canvasUserId,
    canvas_user_name: input.canvasUserName,
    last_verified_at: now,
    last_failure_at: null,
    last_failure_kind: null,
    updated_at: now,
  };

  const { data, error } = await table()
    .upsert(row, { onConflict: "user_id,institution" })
    .select(
      "institution, base_url, token_last_four, canvas_user_id, canvas_user_name, last_verified_at, last_used_at, last_failure_at, last_failure_kind, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(`Could not save the Canvas credential for institution ${normalized}: ${error.message}`);
  }
  return mapLmsCredentialRow(data as Omit<DbRow, "user_id" | "encrypted_token">);
}

/** Forget a user's Canvas connection for one institution. E5: "delete removes the row immediately" - no soft delete, no tombstone; a caller that needs a disposal record for an admin-initiated removal (E-ADM5) keeps it elsewhere, since that record must survive the credential it describes. */
export async function deleteLmsCredential(userId: string, institution: string): Promise<void> {
  const { error } = await table()
    .delete()
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution));

  if (error) {
    throw new Error(`Could not delete the Canvas credential: ${error.message}`);
  }
}

/**
 * Stamp last_used_at to now() after a SUCCESSFUL Canvas call made with this
 * credential - never on a call that was merely attempted (DAT3). Also clears
 * any stale last_failure_at/last_failure_kind, for the same reason
 * saveLmsCredential does: a successful use is direct proof that whatever was
 * previously wrong no longer is, and leaving an old failure diagnostic in
 * place after that would misreport the credential's current state.
 *
 * Best-effort: a failure to write this timestamp must never turn an
 * otherwise-successful Canvas call into a reported error for the end user,
 * so this logs and swallows rather than throwing.
 */
export async function touchLmsCredentialUsed(userId: string, institution: string): Promise<void> {
  const update: DbUpdate = {
    last_used_at: new Date().toISOString(),
    last_failure_at: null,
    last_failure_kind: null,
  };
  const { error } = await table()
    .update(update)
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution));

  if (error) {
    console.error("[lms-credentials] Could not stamp last_used_at:", error.message);
  }
}

/**
 * Record a durable failure diagnostic (E-REL6) for an EXISTING credential -
 * 'unreadable' (decrypt failed), 'rejected' (Canvas refused the token), or
 * 'host_unreachable' (the network layer never got an answer). NOT part of
 * the five frozen exports other groups are already coding against; added
 * because the migration's diagnostic columns need exactly one writer too,
 * matching this module's own "only module that touches this table" rule -
 * without this export, some other file would need its own direct
 * `.from("lms_credentials")` write, which is the precise duplication this
 * module exists to prevent.
 *
 * Deliberately CANNOT record 'no_credential': that failure means no row
 * exists for (userId, institution) at all, so there is nothing here to
 * stamp a diagnostic onto - see LmsCredentialFailureKind's own doc comment.
 * A caller in that situation already knows it (getLmsCredentialSecret
 * returned null with no row read at all) and has no row-shaped place to
 * record it; that gap is named here and in the migration rather than papered
 * over with a write that would silently do nothing.
 *
 * Best-effort, like touchLmsCredentialUsed: a failure to write the
 * diagnostic must never escalate into a second, unrelated error on top of
 * the Canvas failure this function exists to record.
 */
export async function recordLmsCredentialFailure(
  userId: string,
  institution: string,
  kind: LmsCredentialFailureKind
): Promise<void> {
  const update: DbUpdate = {
    last_failure_at: new Date().toISOString(),
    last_failure_kind: kind,
  };
  const { error } = await table()
    .update(update)
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution));

  if (error) {
    console.error("[lms-credentials] Could not record a failure diagnostic:", error.message);
  }
}
