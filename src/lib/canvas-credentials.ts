// The single point where a Canvas credential is decided for one institution
// acronym. Replaces the client-supplied-code-into-process.env lookup that
// used to live in resolveInstitutionByCode (src/lib/canvas-core.ts) - see
// docs/lms-credentials-acceptance-criteria.md E6, E7, E10, SEC5, SEC13, and
// the pre-code architecture passes E-ARCH3/E-ARCH4/E-ARCH8, E-REL1, E-REL4.
// canvas-core.ts is rewired to call this module in a later wave; this module
// does not import from or edit it (its hardcoded-host fallback is copied
// below deliberately, not shared - see HARDCODED_INSTITUTION_HOSTS).
//
// SEC5 - ONE BRANCH, ONE OBJECT. baseUrl and token must always come from the
// SAME source. Before this module, canvas-core.ts resolved them as two
// independent env lookups, so an owner with a token but no URL env var could
// end up with a base URL from one place and a token from another. Every
// return statement below builds the whole CanvasCredential in a single
// expression from a single source - never two separate reads merged after
// the fact - so there is no code path that could disagree with itself about
// where a value came from.
//
// E-ARCH3 - THE EXPORT SURFACE IS THE ENFORCEMENT MECHANISM for the rule
// above. A TypeScript type cannot express "these two fields were resolved
// together"; nothing stops a caller from taking a baseUrl from one call and a
// token from a different one. What DOES stop it: this module exports nothing
// that could hand out either field alone. No getBaseUrl, no getToken, no
// hasCredential. See canvas-credentials.exports.test.ts, which reads this
// file's own source text and fails if a second value export ever appears -
// CANVAS_CREDENTIAL_REQUIRED_MESSAGE (below) is the one deliberate exception,
// because a message string cannot be used to reconstruct a mismatched
// baseUrl/token pair and therefore cannot weaken this invariant.
//
// E-ARCH4 - THE USER ID NEVER TRAVELS AS AN ARGUMENT. resolveCanvasCredential
// takes only the institution code; the identity is resolved server-side from
// ambient state via getEffectiveIdentity(), exactly once, inside this
// function. A user id arriving as a parameter here would be the same defect
// as the client-supplied institution code this module exists to remove,
// relocated rather than fixed.
import { getEffectiveIdentity } from "./supabase/effective-identity";
import { getLmsCredentialSecret, recordLmsCredentialFailure } from "./lms-credentials";

/**
 * What resolveCanvasCredential returns. `source` is not decoration - it is
 * the proof that `baseUrl` and `token` came from the same branch (SEC5), and
 * a future fetch layer should accept exactly this shape rather than a bare
 * `(baseUrl, token)` pair, so no signature in the codebase can accept a
 * mismatched combination even by mistake.
 */
export interface CanvasCredential {
  source: "stored" | "env";
  institution: string;
  baseUrl: string;
  token: string;
}

/**
 * E6/E7/E-UX8 - THE ONE INDISTINGUISHABLE FAILURE. canvas-core.ts today
 * throws three DIFFERENT "not configured" messages that, read together,
 * enumerate exactly which institution acronyms the owner has configured and
 * how completely:
 *   - resolveInstitution (by URL): "That Canvas host is not configured.
 *     Supported institutions: <list>." - names every configured host outright.
 *   - resolveInstitutionByCode: "Canvas base URL is not configured for
 *     <CODE>. Set <CODE>_CANVAS_URL in the environment." - tells a caller the
 *     code has no base URL set (but may have a token).
 *   - resolveInstitutionByCode: "Canvas API token is not configured for
 *     <CODE>. Set <CODE>_CANVAS_API_TOKEN in the environment." - tells a
 *     caller the code DOES have a base URL, just not a token.
 * Any signed-in caller could submit every acronym they could guess and read
 * the owner's environment back one bit at a time from which of the three
 * strings came back. This resolver collapses "no such code", "half-configured
 * env" (one of the two env vars set, not both), and "you have no stored row"
 * into this ONE message, with no institution-specific detail.
 *
 * Exported BY IDENTITY, exactly like OWNER_ONLY_MESSAGE in
 * src/lib/supabase/auth.ts - a surface that must render a designed empty
 * state (E8) catches this message by `=== CANVAS_CREDENTIAL_REQUIRED_MESSAGE`,
 * never by copying the string literal, so the two can never drift apart.
 */
export const CANVAS_CREDENTIAL_REQUIRED_MESSAGE =
  "Connect your Canvas account for this institution in Settings.";

/**
 * E10 - the owner's existing deployment must keep working byte-for-byte.
 * canvas-core.ts's resolveInstitutionByCode falls back to this hardcoded
 * host so a preconfigured institution (MCC) resolves a base URL from just its
 * token, with no `<CODE>_CANVAS_URL` env var required. Copied here rather
 * than imported from canvas-core.ts because that module exports no such
 * table and is out of this wave's file set (it is rewired to call this
 * module, not the other way around, in a later wave) - this is a temporary,
 * narrow duplication of a two-line static fact, not the address-classifier
 * duplication E-ARCH5 warns against. Keep it in sync with
 * CANVAS_INSTITUTIONS in canvas-core.ts until that wave deletes the original.
 */
const HARDCODED_INSTITUTION_HOSTS: Record<string, string> = {
  MCC: "canvas.mccneb.edu",
};

/**
 * E-REL1 - bound the credential read. getLmsCredentialSecret runs behind the
 * service-role client (src/lib/supabase/server.ts), which already bounds each
 * individual fetch attempt to 8s but does not disable postgrest-js's own
 * retry-on-timeout behavior for a `.select()` - a degraded read can still take
 * ~39s (4 attempts x 8s plus backoff) before resolving. That is a SINGLE
 * indexed primary-key lookup, not a scan, and it has a correct fallback on
 * failure (fall through to the env branch, or the one message above) that
 * does not improve with three retries - see this module's own report for why
 * `.retry(false)` could not be applied at its real location.
 */
const CREDENTIAL_READ_TIMEOUT_MS = 5_000;

/** Sentinel distinguishing "the read timed out" from the genuine `null` getLmsCredentialSecret returns for "no usable row" - see readStoredCredentialBounded's own comment for why the two are handled differently. */
const CREDENTIAL_READ_TIMED_OUT = Symbol("canvas-credential-read-timed-out");

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * The owner-only env fallback (E6, SEC13). Reproduces resolveInstitutionByCode's
 * existing env-interpolation exactly - same env var names, same hardcoded-host
 * fallback, same trailing-slash trim, same whitespace trim on the token - so
 * the owner's current deployment resolves an identical credential (E10). Both
 * fields are read here, in this one function, and returned together or not at
 * all: a token with no base URL (or vice versa) is "not configured", not a
 * half-built credential handed back to the caller.
 */
function resolveOwnerEnvCredential(institution: string): { baseUrl: string; token: string } | null {
  const hardcodedHost = HARDCODED_INSTITUTION_HOSTS[institution];
  const baseRaw =
    process.env[`${institution}_CANVAS_URL`]?.trim() ||
    (hardcodedHost ? `https://${hardcodedHost}` : undefined);
  const token = process.env[`${institution}_CANVAS_API_TOKEN`]?.trim() || undefined;
  if (!baseRaw || !token) return null;
  return { baseUrl: baseRaw.replace(/\/+$/, ""), token };
}

/**
 * Read the stored credential with a 5s ceiling (E-REL1). This wraps the CALL
 * to getLmsCredentialSecret in a race against a timer; it cannot reach inside
 * that function to call `.retry(false)` on the actual query builder, because
 * lms-credentials.ts exports no such lever (see this module's own report to
 * the caller of this change for the full account) - editing that file is out
 * of this wave's scope regardless. A race is therefore the only bound
 * available from outside: it guarantees THIS function returns within ~5s
 * even when the underlying read is still retrying in the background, which is
 * what actually keeps the two-reads-in-series total under the platform's 60s
 * cap; it does not stop the abandoned read from continuing to run.
 *
 * The timer is always cleared, on either outcome, so a fast, healthy read
 * never leaves a live handle behind it.
 */
async function readStoredCredentialBounded(
  userId: string,
  institution: string
): Promise<{ baseUrl: string; token: string } | null | typeof CREDENTIAL_READ_TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<typeof CREDENTIAL_READ_TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(CREDENTIAL_READ_TIMED_OUT), CREDENTIAL_READ_TIMEOUT_MS);
  });

  try {
    return await Promise.race([getLmsCredentialSecret(userId, institution), timedOut]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Resolve the Canvas credential the CALLING USER should use for `code`
 * (an institution acronym, e.g. "MCC"). One branch, one object (SEC5):
 *
 *   1. The caller's own stored credential (src/lib/lms-credentials.ts),
 *      keyed on the identity getEffectiveIdentity() resolves - never a
 *      parameter (E-ARCH4). If a row exists, both fields come from it.
 *   2. Only when there is no stored row AND the resolved identity's role is
 *      LITERALLY "owner" (SEC13 - checked here, not at any call site, and
 *      checked against the IMPERSONATED identity when
 *      getEffectiveIdentity() returns one): the owner's own env-configured
 *      pair for `code`, exactly as canvas-core.ts resolves it today (E10).
 *   3. Otherwise, the one indistinguishable failure
 *      (CANVAS_CREDENTIAL_REQUIRED_MESSAGE) - never a message that reveals
 *      whether `code` exists, is half-configured, or simply has no row for
 *      this caller (E6/E7).
 *
 * A non-owner identity can never reach step 2, by construction: a member's
 * unattended scheduled run resolves an impersonated identity with
 * `role: "instructor"`, so it is refused here and never spends the owner's
 * Canvas token (SEC13/E-REL4) - see this module's own report for the traced
 * example.
 */
export async function resolveCanvasCredential(code: string): Promise<CanvasCredential> {
  const institution = normalizeCode(code);
  const identity = await getEffectiveIdentity();

  const stored = await readStoredCredentialBounded(identity.id, institution);
  if (stored !== null && stored !== CREDENTIAL_READ_TIMED_OUT) {
    return { source: "stored", institution, baseUrl: stored.baseUrl, token: stored.token };
  }

  if (stored === null) {
    // getLmsCredentialSecret collapses two different situations into this
    // same `null` by design (see its own doc comment): "no row at all" and
    // "a row exists but this process could not decrypt its token". This
    // resolver cannot tell which one happened from the return value alone,
    // but recordLmsCredentialFailure's UPDATE is keyed on (userId,
    // institution) and matches zero rows when none exists - so calling it
    // unconditionally here is a genuine no-op for the common "never
    // connected" case and a correct E-REL6 diagnostic write for the rarer
    // "connected, but undecryptable" case, without this module needing to
    // guess which one occurred. Best-effort by the callee's own contract -
    // never awaited for its own failure, only for ordering.
    await recordLmsCredentialFailure(identity.id, institution, "unreadable");
  }
  // stored === CREDENTIAL_READ_TIMED_OUT: deliberately NOT recorded as a
  // failure kind. None of the three values in LmsCredentialFailureKind
  // accurately describes "this module's own read timed out" - it is neither
  // a decrypt failure, a Canvas rejection, nor a Canvas-host outage - and
  // recording a guessed kind would misreport the credential's actual state
  // the next time someone reads it (E-REL6 exists to report the CURRENT
  // state, not a guess).

  if (identity.role === "owner") {
    const envCredential = resolveOwnerEnvCredential(institution);
    if (envCredential) {
      return { source: "env", institution, baseUrl: envCredential.baseUrl, token: envCredential.token };
    }
  }

  throw new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
}
