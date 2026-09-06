import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";
import { getAppUserWithTimeout, ensureAppUserRowExists } from "./app-users";
import { resolveAccess, isPublicPath, loginRedirectFor, type AccessProfile } from "../access";

/**
 * BUG 1(a) (now fixed): a Supabase project that is slow but not fully DOWN
 * (a degraded instance, a cold region, a transient spike) would hang EVERY
 * request until the platform's own function timeout killed it - this file
 * cannot set `runtime` or `maxDuration` at all (see the doc comment below),
 * so there is no application-level ceiling to fall back on otherwise. The
 * profile lookup was bounded first; the gate's OWN Supabase client was not,
 * even though its getUser() call is the FIRST network call this function
 * makes and runs before the isPublicPath early return - so it sat on the
 * path of every request in the app, /login, /api/cron and the GitHub webhook
 * included. See boundedFetch below: the SAME value now bounds getUser(), the
 * MFA getAuthenticatorAssuranceLevel() call further down, and this profile
 * lookup, via the client's own `global.fetch` option - one constant, three
 * call sites, rather than a second timeout number for the auth client that
 * would need its own justification.
 *
 * 5 seconds: generous for a single indexed primary-key lookup against the
 * same Supabase project every other read in this app already depends on -
 * this is not a third-party network call (contrast the 10s used for an
 * arbitrary EXTERNAL calendar-feed URL in
 * src/app/actions/course-hub-integrations.ts:52, which has to tolerate a
 * server this deployment does not control) - but short enough that a
 * degraded-but-not-fully-down instance cannot hold the gate, and therefore
 * every request the whole app serves, hostage for tens of seconds while the
 * platform's own timeout is what eventually ends it. The same reasoning
 * applies to getUser() and getAuthenticatorAssuranceLevel(): both talk to
 * this exact same first-party Supabase project, not a third-party service
 * that might legitimately need a longer allowance.
 */
const PROFILE_LOOKUP_TIMEOUT_MS = 5_000;

/**
 * Gives the gate's own Supabase client (below) a fetch that aborts after
 * PROFILE_LOOKUP_TIMEOUT_MS, via `@supabase/ssr`'s `global.fetch` option -
 * so BOTH of that client's network calls (auth.getUser() and
 * auth.mfa.getAuthenticatorAssuranceLevel(), further down in updateSession)
 * inherit the same ceiling the app_users lookup already has, instead of
 * running unbounded.
 *
 * What an aborted fetch actually surfaces as was verified empirically (Node
 * 22 / undici - the runtime this proxy actually runs under, see the
 * RUNTIME NOTE below) rather than assumed: a `DOMException` named
 * "TimeoutError", not "AbortError" (auth-js's install here is
 * @supabase/auth-js 2.106.2; "AbortError" is what a manually-triggered
 * `AbortController.abort()` produces, which this is not - `AbortSignal.timeout()`
 * has its own distinct name for exactly this reason). That distinction never
 * reaches this gate's own code, though: auth-js's request plumbing
 * (`_handleRequest` in `@supabase/auth-js/dist/main/lib/fetch.js`) already
 * wraps every call to the fetcher it's given in a try/catch that converts
 * ANY exception - by name or shape, `looksLikeFetchResponse` is only
 * consulted afterwards - into an `AuthRetryableFetchError`. Every
 * GoTrueClient method this gate calls (`getUser()`,
 * `getAuthenticatorAssuranceLevel()`, and the token-refresh call the latter
 * can trigger internally via `getSession()`) already returns that as the
 * normal `error` half of its `{ data, error }` result rather than letting it
 * escape as a rejection - see `_getUser`'s and `_callRefreshToken`'s own
 * `catch (error) { if (isAuthError(error)) return { data, error }; ... }`
 * blocks. Two consequences:
 *
 * 1. The existing `isAuthRetryableFetchError(getUserError)` check below
 *    already recognizes a timed-out `getUser()` with no changes of its own
 *    needed - a timeout lands in the exact same `authFailed` ->
 *    `unavailable` branch a hard transport failure already did.
 * 2. Neither call can leak an abort out of this function as an unhandled
 *    rejection: auth-js swallows it into that same `error` field before it
 *    ever reaches this module.
 */
const boundedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(PROFILE_LOOKUP_TIMEOUT_MS) });

/**
 * Refreshes the Supabase auth session on every request and gates the app
 * using the single access decision (resolveAccess, from ../access) - the
 * SAME decision the server-action guard (requireUser()/requireAppOwner() in
 * ./auth.ts) uses, so the request gate and the action guard can never
 * disagree about who is let in (AC A4). Called from `src/proxy.ts`.
 *
 * RUNTIME NOTE: this logic used to live in `src/middleware.ts` /
 * `src/lib/supabase/middleware.ts`, and `middleware` defaults to the EDGE
 * runtime. Next 16 deprecates that file convention in favour of `proxy`
 * (see src/proxy.ts), which defaults to the NODE runtime instead - a
 * platform/latency change, not a change to the gate's own logic. See
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md,
 * "Runtime": the `runtime` config option is not available in a proxy file at
 * all (setting it throws), so this module and src/proxy.ts export none.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
      // See boundedFetch's own comment: this is what bounds getUser() below
      // and the MFA check further down, not just the profile lookup.
      global: {
        fetch: boundedFetch,
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser.
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  // isPublicPath (src/lib/access.ts) owns the exemption table - /login,
  // /auth, /api/cron, /api/triggers, and /api/github/webhook (the addition
  // that fixes REGRESSION 398 point B3: without it, GitHub's push webhook
  // was 307-redirected to /login before its own HMAC verifier ever ran).
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return response;
  }

  // BUG 1(b): `error` used to be destructured away entirely, so the gate
  // could not tell "nobody is signed in" apart from "Supabase itself could
  // not be reached". getUser() returns `{ data: { user: null }, error }` for
  // BOTH: an ordinary signed-out visitor gets a benign AuthSessionMissingError
  // here (that is not a failure - a missing session is not an error, and
  // must not become `unavailable`), while Supabase being unreachable
  // (network failure, or a 502/503/504/5xx gateway error - see
  // @supabase/auth-js's own NETWORK_ERROR_CODES list) surfaces as an
  // AuthRetryableFetchError. Only the latter is a transport failure worth
  // treating as an outage.
  //
  // `authFailed` is threaded into resolveAccess (src/lib/access.ts) rather
  // than this gate calling loginRedirectFor directly with the `unavailable`
  // decision: resolveAccess checks `authFailed` FIRST, ahead of its own
  // no-email branch and the owner break-glass, so the single decision
  // function - not a second copy of the rule living here - is what turns a
  // transport failure into `unavailable`. The profile lookup below is still
  // skipped for this case, because a transport failure always leaves `user`
  // null, so there is no user id to look up in the first place.
  const authFailed = Boolean(getUserError && isAuthRetryableFetchError(getUserError));

  // Resolve this session's account row (skipped entirely for a signed-out
  // request, and for an auth transport failure - resolveAccess's "no email"
  // and `authFailed` branches handle those without needing a lookup). A
  // lookup ERROR is distinguished from a MISSING row: the former sets
  // `lookupFailed`, which resolveAccess turns into `unavailable` and denies
  // - it must never be read as "no row" (pending) or, worse, fall through to
  // allowed. The env-allowlist break-glass in resolveAccess still lets the
  // deployment owner in even when this lookup fails, because isOwnerEmail is
  // checked before `lookupFailed` is even consulted (see resolveAccess's own
  // ordering).
  let profile: AccessProfile | null = null;
  let lookupFailed = false;
  // Set only from a SUCCESSFUL AAL determination that says step-up is
  // outstanding (see below) - never from a failed one, so a failed call can
  // never be misread as "step-up needed" any more than it can be misread as
  // "no factor enrolled".
  let needsMfaStepUp = false;
  // True only when the AAL determination itself failed to produce an answer
  // - distinct from it succeeding with an aal1 ("no factor enrolled" or "no
  // session") result. See the block below for why the two can never be
  // confused with each other. Folded into `authFailed` further down rather
  // than given its own redirect: a failed determination is exactly the
  // "could not tell whether access is allowed" condition `authFailed`
  // already exists for, so it is denied through that SAME single
  // resolveAccess/loginRedirectFor call rather than a second one - including
  // for an owner account, which gets no exemption from the step-up check
  // below either.
  let mfaCheckFailed = false;
  if (user) {
    try {
      // BUG 1(a): bounded by PROFILE_LOOKUP_TIMEOUT_MS (see that constant's
      // own comment) instead of running unbounded. A timeout surfaces here
      // exactly like any other lookup failure - see getAppUserWithTimeout's
      // own comment for why no separate handling is needed.
      const row = await getAppUserWithTimeout(user.id, PROFILE_LOOKUP_TIMEOUT_MS);
      profile = row ? { role: row.role, status: row.status } : null;
    } catch {
      lookupFailed = true;
    }

    // FIX (missing-row recovery is reachable only from here): ensureAppUserRowExists
    // (./app-users.ts) exists to create a bare row for an account that has
    // none, but its only OTHER caller is requireUser() - and a row-less
    // account resolves to `pending`, which this gate 307s to /login BEFORE
    // any server action or route handler runs. /login is a client component
    // that calls no server action, so the recovery could never fire for the
    // exact population it was written for. This is the only remaining place
    // it can run.
    //
    // Gated on `!lookupFailed && !profile`, not merely `!profile`: a lookup
    // FAILURE means we do not know whether a row exists (`lookupFailed`), and
    // inserting on that guess would be wrong - this only fires when the
    // lookup itself SUCCEEDED and positively found no row. Deliberately
    // outside the try/catch above so a failure inside ensureAppUserRowExists
    // itself can never be mistaken for a failure of the profile lookup and
    // flip `lookupFailed` to true - that would change the access decision
    // computed below from what the lookup itself actually determined.
    // Best-effort: awaited so the attempt has actually completed before this
    // request finishes, but any failure is caught and swallowed here and
    // must never change or delay the redirect decision already computed from
    // `profile`/`lookupFailed` as they stand above.
    //
    // A collision on the unique `lower(email)` index (e.g. a case-differing
    // duplicate email already claiming the row) makes the insert inside
    // ensureAppUserRowExists a silent no-op rather than an error, so this
    // retries harmlessly on every request for such an account without ever
    // succeeding - a known, unrecoverable state that this call does not fix,
    // not a bug in this call itself.
    //
    // isPublicPath's early return above already exits this function before
    // this point for any public path, so this never runs for one.
    if (user && !lookupFailed && !profile) {
      try {
        await ensureAppUserRowExists(user.id);
      } catch {
        // Best-effort recovery only - see the comment above.
      }
    }

    // Account has MFA enrolled but hasn't completed it this session: send
    // them back to /login to finish the second step. (No factor enrolled ->
    // nextLevel is aal1, `needsMfaStepUp` stays false, and it can't lock
    // anyone out before setup.)
    //
    // BUG (rival model): `error` used to be discarded entirely here, so a
    // FAILED determination (`data: null`) fell through the `if` exactly like
    // a legitimate aal1 answer - and the bounded fetch above (`boundedFetch`)
    // turns a slow Supabase into a deterministic timeout, so a degraded auth
    // service would silently disable second-factor enforcement for every
    // account that has one. The fix cannot confuse the two: per
    // @supabase/auth-js's own `_getAuthenticatorAssuranceLevel`
    // (GoTrueClient.js), EVERY error path returns `{ data: null, error }`,
    // and EVERY success path - including the "no session" and "no factor
    // enrolled" cases - returns `{ data: <a real object>, error: null }`.
    // Checking `aalResult.error` (not destructured separately from `data`,
    // so TypeScript keeps the two properties correlated as the discriminated
    // union they are) is therefore truthy if and only if the call genuinely
    // failed; a legitimate aal1 result always arrives with `error` null and
    // a populated `data`.
    const aalResult = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalResult.error) {
      mfaCheckFailed = true;
    } else if (aalResult.data.nextLevel === "aal2" && aalResult.data.currentLevel !== "aal2") {
      needsMfaStepUp = true;
    }
  }

  const decision = resolveAccess({
    email: user?.email,
    profile,
    lookupFailed,
    authFailed: authFailed || mfaCheckFailed,
    // BUG 1 FIX: threads the verified state into the single access decision
    // (see resolveAccess's own ResolveAccessInput.emailVerified doc comment)
    // so the OWNER_EMAILS break-glass cannot be claimed by an unverified
    // account. `user` already comes from this gate's own getUser() call
    // above; `email_confirmed_at` is on the installed @supabase/auth-js
    // `User` type.
    emailVerified: Boolean(user?.email_confirmed_at),
  });
  const redirectTarget = loginRedirectFor(decision, `${pathname}${request.nextUrl.search}`);
  if (redirectTarget) {
    // loginRedirectFor resolves against a fixed internal origin (see
    // access.ts) purely so it can validate/encode the destination safely; it
    // is never the real origin. Clone the REAL request URL for that, and
    // only take the computed pathname+search off the safe result (R2: this
    // is what carries the intended destination through to /login, instead
    // of the old `url.search = ""` that discarded it).
    const url = request.nextUrl.clone();
    url.pathname = redirectTarget.pathname;
    url.search = redirectTarget.search;
    return NextResponse.redirect(url);
  }

  if (needsMfaStepUp) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
