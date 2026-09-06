import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * BUG 1 (rival model): neither client below passed `global.fetch`, so every
 * server-side Supabase call - every server action, every route handler, every
 * page - ran unbounded. `./proxy.ts` (the request gate, 5s) and `./client.ts`
 * (the browser client, 18s) already got this treatment; these two were the
 * gap. Worst case named in the finding: an admin page making ~9 SEQUENTIAL
 * Supabase round trips (three in the gate - already bounded - three more in
 * the guard repeating that same work, plus an account list and an owner
 * count through these two clients) would, against a merely DEGRADED (not
 * fully down) provider, take minutes rather than seconds - inside the
 * platform's 60s cap, so the operator sees an opaque platform timeout
 * instead of a real error, on the one page whose job is incident management.
 *
 * 8 SECONDS - between the gate's 5s and the browser's 18s, not equal to
 * either. Same reasoning as the gate for the LOW end: this is a first-party
 * server talking to the same-region Supabase project every other read in
 * this app already depends on, not an arbitrary third-party network (see
 * PROFILE_LOOKUP_TIMEOUT_MS's own comment in ./proxy.ts) - so it should stay
 * far below the browser's 18s, which has to tolerate hotel wifi and DNS/TLS
 * setup on top of the request itself. But unlike the gate's single indexed
 * primary-key lookup, the calls behind these two clients include an account
 * list and an owner count - a scan/aggregate over a table, not a PK lookup -
 * so reusing 5s outright risks aborting a legitimately slow-but-working
 * query, not just a hung one. 8s gives that headroom while still failing an
 * actually-degraded call an order of magnitude before the platform's own 60s
 * cap would.
 *
 * CAVEAT (verified against the installed @supabase/postgrest-js 2.106.2
 * source, not assumed): a PostgREST query is a DIFFERENT code path from the
 * auth one PROFILE_LOOKUP_TIMEOUT_MS's comment documents, and the two behave
 * differently on an abort:
 *
 *  - `AbortSignal.timeout()` rejects the underlying fetch with a
 *    `DOMException` named "TimeoutError" (never "AbortError") - true on both
 *    paths.
 *  - `@supabase/auth-js`'s `_handleRequest` catches ANY exception, by name or
 *    shape, and converts it into an `AuthRetryableFetchError` - the name
 *    never matters there.
 *  - `@supabase/postgrest-js`'s `PostgrestBuilder.then` (`executeWithRetry`)
 *    DOES branch on the name: its "never retry an aborted request" check
 *    (`fetchError?.name === 'AbortError' || fetchError?.code === 'ABORT_ERR'`)
 *    does NOT match "TimeoutError", so a timed-out `.select()` (GET - the
 *    only methods this ratchet retries; see RETRYABLE_METHODS) is treated as
 *    an ordinary retryable network error: postgrest-js retries it up to
 *    `DEFAULT_MAX_RETRIES` (3) more times, with its own exponential backoff
 *    sleep between attempts (1s, 2s, 4s - `getRetryDelay`), and each retried
 *    attempt gets a FRESH `AbortSignal.timeout(8000)` from `boundedFetch`
 *    below, so it can time out again. Worst case for one read that stays
 *    degraded for the whole exchange: 4 attempts x 8s + ~7s of backoff sleep
 *    (~39s) before the caller ever sees an error - finite, where today it is
 *    infinite, but not small. A write (POST/PATCH/DELETE) is NOT in
 *    RETRYABLE_METHODS, so it fails on the first timeout with no retry.
 *  - Either way, the FINAL shape reaching the caller is still the ordinary
 *    `{ data: null, error: {...} }` result, never a thrown exception -
 *    `PostgrestBuilder.then` catches the exhausted-retry error itself and
 *    resolves with it (`res.catch(fetchError => ({ success: false, error:
 *    {...}, data: null, ... }))`) unless the caller opted into
 *    `.throwOnError()`. So the "callers check `error`, they don't catch"
 *    assumption already in this codebase holds for this path too - but
 *    `error.hint`/`error.code` stay empty (postgrest-js's own "aborted"
 *    hint-building also only recognizes the literal name "AbortError", so it
 *    never fires for a `TimeoutError` either); only `error.message` carries
 *    the "TimeoutError: ..." text.
 *
 * The retry compounding above is inherent to postgrest-js and pre-dates this
 * fix - it is not introduced by adding a timeout, and is not something a
 * `global.fetch` option can turn off (that is a per-query `.retry(false)`,
 * orthogonal to this file). Before this fix a stuck read simply hung
 * forever, uncounted and unretried, until the platform killed the whole
 * function; after it, the same read fails in a bounded, finite amount of
 * time. That bound is real but not tiny, so a sequence of several heavy
 * reads that are ALL retried to exhaustion could still approach the
 * platform's 60s cap on its own - a structural argument for the
 * not-yet-built admin page to fail fast / run its checks in parallel rather
 * than purely sequentially, not something this file's fetch timeout alone
 * can guarantee away.
 */
const SERVER_FETCH_TIMEOUT_MS = 8_000;

const boundedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS) });

/**
 * Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Reads/writes the user's session via Next.js cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // `setAll` was called from a Server Component. Safe to ignore when
            // middleware is refreshing the session for the request.
          }
        },
      },
      // See SERVER_FETCH_TIMEOUT_MS's own comment above for the chosen value
      // and the verified retry behaviour on an aborted PostgREST query.
      global: {
        fetch: boundedFetch,
      },
    }
  );
}

/**
 * Service-role client for trusted server-side operations that need to bypass RLS.
 * NEVER expose this to the browser. Use only in Route Handlers / Server Actions.
 */
export function createServiceClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
      // See SERVER_FETCH_TIMEOUT_MS's own comment above.
      global: {
        fetch: boundedFetch,
      },
    }
  );
}
